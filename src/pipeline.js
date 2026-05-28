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

/**
 * Full compilation pipeline.
 * @param {string} input — the SQL query string
 * @returns {{ tokens, parseTree, ast, semanticErrors, code, stages }}
 */
export function compile(input) {
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
  })).filter(t => t.type !== 'EOF');

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
  const analyzer = new SemanticAnalyzer();
  // Analyze each query in the program
  for (const query of result.ast.queries) {
    const { errors } = analyzer.analyze(query);
    result.semanticErrors.push(...errors);
  }

  if (result.semanticErrors.length > 0) {
    result.errors.push(...result.semanticErrors);
    stages.push({ name: 'Semantic', status: 'error' });
    return result;
  }
  stages.push({ name: 'Semantic', status: 'ok' });

  // ── 5. CODE GENERATION ────────────────────
  try {
    const codegen = new CodeGenerator();
    // Generate code for first query (TUI handles one query at a time)
    const firstQuery = result.ast.queries[0];
    const { code, formattedCode } = codegen.generate(firstQuery);
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
  const compiled = compile(input);
  if (compiled.errors.length > 0) {
    return { ...compiled, result: null, runtimeError: null };
  }

  const executor = new Executor();
  let data;
  let joinData;
  try {
    data = executor.loadJSON(dataPath);
    joinData = joinDataPath ? executor.loadJSON(joinDataPath) : null;
  } catch (e) {
    const error = e?.phase ? e : new CompilerError('runtime', e.message, null);
    compiled.errors.push(error);
    compiled.stages.push({ name: 'Runtime', status: 'error' });
    return { ...compiled, result: null, runtimeError: error };
  }

  const { result, error } = executor.execute(compiled.code, data, joinData);

  if (error) {
    compiled.errors.push(error);
    compiled.stages.push({ name: 'Runtime', status: 'error' });
  } else {
    compiled.stages.push({ name: 'Runtime', status: 'ok' });
  }

  return { ...compiled, result, runtimeError: error };
}
