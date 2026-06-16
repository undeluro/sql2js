// ──────────────────────────────────────────────
// sql2js — Main Compiler Pipeline
// Ties together: Lexer → Parser → AST → Semantic → Codegen → Execute
// ──────────────────────────────────────────────

import antlr4 from 'antlr4';
import JsonQueryLexer from './generated/JsonQueryLexer.js';
import JsonQueryParser from './generated/JsonQueryParser.js';
import ASTBuilder from './ast/builder.js';
import SemanticAnalyzer from './semantic/analyzer.js';
import CodeGenerator from './codegen/generator.js';
import Executor from './runtime/executor.js';
import { CollectingErrorListener, CompilerError } from './errors/errors.js';
import { mergeSchemas, normalizeDataset } from './runtime/dataset.js';
import { cloneDatabaseData, loadDatabase, refreshDatabaseSchema } from './runtime/database.js';

/**
 * Full compilation pipeline.
 * @param {string} input — the SQL query string
 * @returns {{ tokens, parseTree, ast, semanticErrors, code, stages }}
 */
export function compile(input, options = {}) {
  const stages = [];
  const result = {
    tokens: null,
    parseTree: null,
    ast: null,
    semanticErrors: [],
    code: null,
    errors: [],
    stages,
  };

  // ── 1. LEX ────────────────────────────────
  const chars = new antlr4.InputStream(input);
  const lexer = new JsonQueryLexer(chars);
  const errorListener = new CollectingErrorListener('lexical');

  lexer.removeErrorListeners();
  lexer.addErrorListener(errorListener);

  const tokenStream = new antlr4.CommonTokenStream(lexer);
  tokenStream.fill();

  result.tokens = tokenStream.tokens.map(t => ({
    type: JsonQueryLexer.symbolicNames[t.type] || String(t.type),
    text: t.text,
    line: t.line,
    column: t.column,
  })).filter(t => t.type !== '-1');

  if (errorListener.errors.length > 0) {
    result.errors.push(...errorListener.errors);
    stages.push({ name: 'Lexer', status: 'error' });
    return result;
  }
  stages.push({ name: 'Lexer', status: 'ok' });

  // ── 2. PARSE ──────────────────────────────
  const parser = new JsonQueryParser(tokenStream);
  const parserErrorListener = new CollectingErrorListener('syntax');

  parser.removeErrorListeners();
  parser.addErrorListener(parserErrorListener);

  const parseTree = parser.program();
  result.parseTree = parseTree;

  if (parserErrorListener.errors.length > 0) {
    result.errors.push(...parserErrorListener.errors);
    stages.push({ name: 'Parser', status: 'error' });
    return result;
  }
  stages.push({ name: 'Parser', status: 'ok' });

  // ── 3. BUILD AST ──────────────────────────
  try {
    const builder = new ASTBuilder();
    result.ast = builder.visit(parseTree);
    stages.push({ name: 'AST', status: 'ok' });
  } catch (e) {
    result.errors.push(new CompilerError('compiletime', `Failed to build AST: ${e.message}`, null));
    stages.push({ name: 'AST', status: 'error' });
    return result;
  }

  // ── 4. SEMANTIC ANALYSIS ──────────────────
  const analyzer = new SemanticAnalyzer(options.schema || null);
  const { errors } = analyzer.analyzeProgram(result.ast);
  result.semanticErrors.push(...errors);

  if (result.semanticErrors.length > 0) {
    result.errors.push(...result.semanticErrors);
    stages.push({ name: 'Semantic', status: 'error' });
    return result;
  }
  stages.push({ name: 'Semantic', status: 'ok' });

  // ── 5. CODE GENERATION ────────────────────
  try {
    const codegen = new CodeGenerator();
    const { code, formattedCode } = codegen.generate(result.ast);
    result.code = code;
    result.formattedCode = formattedCode;
    stages.push({ name: 'Codegen', status: 'ok' });
  } catch (e) {
    result.errors.push(new CompilerError('compiletime', `Failed to generate JavaScript: ${e.message}`, null));
    stages.push({ name: 'Codegen', status: 'error' });
    return result;
  }

  return result;
}

/**
 * Full end-to-end: compile + execute
 */
export function compileAndExecute(input, dataPath, joinDataPath = null) {
  const parsed = compile(input);
  if (parsed.errors.length > 0) {
    return { ...parsed, result: null, dataset: null, runtimeError: null };
  }

  const executor = new Executor();
  let dataset;
  let joinDataset = null;
  let schema;
  try {
    const rawData = executor.loadJSON(dataPath);
    dataset = normalizeDataset(rawData, dataPath);

    if (joinDataPath) {
      const rawJoinData = executor.loadJSON(joinDataPath);
      joinDataset = normalizeDataset(rawJoinData, joinDataPath);
    }

    schema = mergeSchemas(dataset.schema, joinDataset?.schema || null);
  } catch (e) {
    const error = e?.phase ? e : new CompilerError('runtime', e.message, null);
    return {
      tokens: null,
      parseTree: null,
      ast: null,
      semanticErrors: [],
      code: null,
      errors: [error],
      stages: [{ name: 'Runtime', status: 'error' }],
      result: null,
      dataset: null,
      runtimeError: error,
    };
  }

  const compiled = compile(input, { schema });
  if (compiled.errors.length > 0) {
    return { ...compiled, result: null, dataset: dataset.data, runtimeError: null };
  }

  const { result: executionResult, error } = executor.execute(
    compiled.code,
    dataset.data,
    joinDataset?.data || null
  );

  if (error) {
    compiled.errors.push(error);
    compiled.stages.push({ name: 'Runtime', status: 'error' });
  } else {
    compiled.stages.push({ name: 'Runtime', status: 'ok' });
  }

  return {
    ...compiled,
    result: executionResult?.result ?? null,
    dataset: executionResult?.dataset ?? dataset.data,
    mutated: Boolean(executionResult?.mutated),
    mutations: executionResult?.mutations || [],
    mutationSummary: formatMutationSummary(executionResult?.mutations || []),
    runtimeError: error,
  };
}

export function createDatabaseSession(filePath) {
  return loadDatabase(filePath);
}

export function executeProgram(input, session, options = {}) {
  const schema = mergeSchemas(session.schema, options.joinSession?.schema || null);
  const compiled = compile(input, { schema });
  if (compiled.errors.length > 0) {
    return {
      ...compiled,
      result: null,
      dataset: session.data,
      mutated: false,
      mutations: [],
      mutationSummary: '',
      runtimeError: null,
    };
  }

  const executor = new Executor();
  const workingData = cloneDatabaseData(session.data);
  const joinData = options.joinSession ? cloneDatabaseData(options.joinSession.data) : null;
  const { result: executionResult, error } = executor.execute(compiled.code, workingData, joinData);

  if (error) {
    compiled.errors.push(error);
    compiled.stages.push({ name: 'Runtime', status: 'error' });
    return {
      ...compiled,
      result: null,
      dataset: session.data,
      mutated: false,
      mutations: [],
      mutationSummary: '',
      runtimeError: error,
    };
  }

  const mutated = Boolean(executionResult?.mutated);
  if (mutated) {
    session.data = executionResult.dataset;
    refreshDatabaseSchema(session);
  }

  compiled.stages.push({ name: 'Runtime', status: 'ok' });

  const mutations = executionResult?.mutations || [];
  return {
    ...compiled,
    result: executionResult?.result ?? null,
    dataset: executionResult?.dataset ?? session.data,
    mutated,
    mutations,
    mutationSummary: formatMutationSummary(mutations),
    runtimeError: null,
  };
}

export function formatMutationSummary(mutations) {
  if (!mutations || mutations.length === 0) return '';

  return mutations.map(mutation => {
    switch (mutation.type) {
      case 'create':
        return `Created collection ${mutation.collection} with ${mutation.count} rows`;
      case 'insert':
        return `Inserted ${mutation.count} row into ${mutation.collection}`;
      case 'update':
        return `Updated ${mutation.count} rows in ${mutation.collection}`;
      case 'delete':
        return `Deleted ${mutation.count} rows from ${mutation.collection}`;
      default:
        return `${mutation.type} ${mutation.collection}`;
    }
  }).join('; ');
}
