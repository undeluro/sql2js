#!/usr/bin/env node

// ──────────────────────────────────────────────
// sql2js TUI — Minimalistic Interactive Terminal UI
// Uses React.createElement instead of JSX (no build step needed)
// ──────────────────────────────────────────────

import React, { useState } from 'react';
import { render, Box, Text, useApp, useInput } from 'ink';
import { compile, compileAndExecute } from '../pipeline.js';
import { formatCompilerError } from '../errors/errors.js';
import {
  colors, highlightSQL, highlightJS,
  pipelineBar, formatTable,
} from './theme.js';
import { extname, resolve } from 'node:path';
import { existsSync, statSync } from 'node:fs';

const h = React.createElement;

// ── Detect data file from CLI args ───────────
function resolveDataPath(arg) {
  if (!arg) return null;
  const normalized = arg.trim().replace(/^['"]|['"]$/g, '');
  const abs = resolve(process.cwd(), normalized);
  return existsSync(abs) && statSync(abs).isFile() && extname(abs).toLowerCase() === '.json'
    ? abs
    : null;
}

// ── Main App Component ───────────────────────

function App({ initialDataPath, initialJoinPath }) {
  const { exit } = useApp();
  const [query, setQuery] = useState('');
  const [dataPath, setDataPath] = useState(initialDataPath || '');
  const [joinPath] = useState(initialJoinPath || '');
  const [result, setResult] = useState(null);
  const [mode, setMode] = useState(initialDataPath ? 'query' : 'data');
  const [history, setHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [dataError, setDataError] = useState(null);

  useInput((input, key) => {
    if (key.ctrl && input === 'c') { exit(); return; }
    if (key.ctrl && input === 'q') { exit(); return; }

    if (mode === 'data') {
      if (key.return) {
        const resolved = resolveDataPath(dataPath);
        if (resolved) {
          setDataPath(resolved);
          setDataError(null);
          setMode('query');
        } else {
          setDataError(dataPath.trim()
            ? `Enter an existing .json file, not a directory: ${dataPath.trim()}`
            : 'Enter a JSON file path, for example data/users.json');
        }
        return;
      }
      setDataError(null);
      handleTextInput(input, key, dataPath, setDataPath);
      return;
    }

    if (mode === 'query') {
      if (key.upArrow && history.length > 0) {
        const idx = historyIdx < history.length - 1 ? historyIdx + 1 : historyIdx;
        setHistoryIdx(idx);
        setQuery(history[history.length - 1 - idx]);
        return;
      }
      if (key.downArrow) {
        if (historyIdx > 0) {
          setHistoryIdx(historyIdx - 1);
          setQuery(history[history.length - historyIdx]);
        } else {
          setHistoryIdx(-1);
          setQuery('');
        }
        return;
      }

      handleTextInput(input, key, query, setQuery);

      if (key.return && query.trim()) {
        executeQuery(query.trim());
      }
      return;
    }

    if (mode === 'result') {
      if (key.return || key.escape || input === ' ') {
        setMode('query');
        setQuery('');
        return;
      }
    }
  });

  function handleTextInput(input, key, value, setter) {
    if (key.backspace || key.delete) {
      setter(value.slice(0, -1));
    } else if (!key.ctrl && !key.meta && !key.upArrow && !key.downArrow && !key.return && !key.escape && input) {
      setter(value + input);
    }
  }

  function executeQuery(q) {
    const queryStr = q.endsWith(';') ? q : q + ';';
    setHistory(prev => [...prev, queryStr]);
    setHistoryIdx(-1);

    try {
      const compiled = compile(queryStr);
      if (compiled.errors.length > 0) {
        setResult({ query: queryStr, stages: compiled.stages, errors: compiled.errors, code: null, data: null });
      } else if (dataPath) {
        const execResult = compileAndExecute(queryStr, dataPath, joinPath || null);
        setResult({ query: queryStr, stages: execResult.stages, errors: execResult.errors, code: compiled.code, data: execResult.result });
      } else {
        setResult({ query: queryStr, stages: compiled.stages, errors: [], code: compiled.code, data: null });
      }
    } catch (e) {
      setResult({
        query: queryStr,
        stages: [{ name: 'Error', status: 'error' }],
        errors: [{ phase: 'system', message: e.message }],
        code: null, data: null,
      });
    }
    setMode('result');
  }

  // ── Render ─────────────────────────────────

  const children = [];

  // Header
  children.push(
    h(Box, { key: 'header', marginBottom: 1 },
      h(Text, null,
        `${colors.primary('⚡')} ${colors.heading('sql2js')} ${colors.muted('— SQL-to-JS Compiler for JSON')}`
      )
    )
  );

  // Data file input mode
  if (mode === 'data') {
    children.push(
      h(Box, { key: 'data-mode', flexDirection: 'column' },
        h(Text, null, colors.secondary('📂 Enter path to JSON data file:')),
        h(Box, { marginTop: 1 },
          h(Text, null, `${colors.muted('>')} ${dataPath}${colors.primary('█')}`)
        ),
        dataError && h(Box, { marginTop: 1 },
          h(Text, null, colors.error(dataError))
        ),
        h(Box, { marginTop: 1 },
          h(Text, null, colors.dimText('Example: data/users.json - Press Enter to confirm - Ctrl+C to exit'))
        )
      )
    );
  }

  // Query input mode
  if (mode === 'query') {
    children.push(
      h(Box, { key: 'query-mode', flexDirection: 'column' },
        h(Text, null, colors.muted(`📂 ${dataPath ? dataPath.split(/[\\/]/).pop() : 'no file'}`)),
        h(Box, { marginTop: 1 },
          h(Text, null, `${colors.secondary('Query:')} ${highlightSQL(query)}${colors.primary('█')}`)
        ),
        h(Box, { marginTop: 1 },
          h(Text, null, colors.dimText('Enter to run • ↑↓ history • Ctrl+Q quit'))
        )
      )
    );
  }

  // Result mode
  if (mode === 'result' && result) {
    const resultChildren = [];

    // Query echo
    resultChildren.push(
      h(Text, { key: 'query-echo' },
        `${colors.muted('Query:')} ${highlightSQL(result.query)}`)
    );

    // Pipeline
    resultChildren.push(
      h(Box, { key: 'pipeline', marginTop: 1 },
        h(Text, null, `${colors.muted('Pipeline:')} ${pipelineBar(result.stages)}`)
      )
    );

    // Errors
    if (result.errors.length > 0) {
      const errorItems = [
        h(Text, { key: 'err-title' }, colors.error('Errors:'))
      ];
      result.errors.forEach((e, i) => {
        const formatted = formatCompilerError(e, result.query)
          .split('\n')
          .map(line => `  ${line}`)
          .join('\n');
        errorItems.push(
          h(Text, { key: `err-${i}` },
            colors.error(formatted))
        );
      });
      resultChildren.push(
        h(Box, { key: 'errors', flexDirection: 'column', marginTop: 1 }, ...errorItems)
      );
    }

    // Generated JS
    if (result.code) {
      resultChildren.push(
        h(Box, { key: 'codegen', flexDirection: 'column', marginTop: 1 },
          h(Text, { key: 'code-title' }, colors.muted('Generated JS:')),
          h(Text, { key: 'code-body' }, highlightJS(result.code))
        )
      );
    }

    // Results table
    if (result.data && result.data.length > 0) {
      resultChildren.push(
        h(Box, { key: 'results', flexDirection: 'column', marginTop: 1 },
          h(Text, { key: 'res-title' }, colors.muted(`Results (${result.data.length} rows):`)),
          h(Text, { key: 'res-table' }, formatTable(result.data, Object.keys(result.data[0])))
        )
      );
    } else if (result.data && result.data.length === 0) {
      resultChildren.push(
        h(Box, { key: 'no-results', marginTop: 1 },
          h(Text, null, colors.dimText('  (no matching rows)'))
        )
      );
    }

    // Continue prompt
    resultChildren.push(
      h(Box, { key: 'continue', marginTop: 1 },
        h(Text, null, colors.dimText('Press Enter for new query • Ctrl+Q quit'))
      )
    );

    children.push(
      h(Box, { key: 'result-mode', flexDirection: 'column' }, ...resultChildren)
    );
  }

  return h(Box, { flexDirection: 'column', paddingX: 1 }, ...children);
}

// ── Entry Point ──────────────────────────────

const args = process.argv.slice(2);
let dataPath = null;
let joinPath = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--data' || args[i] === '-d') {
    dataPath = resolveDataPath(args[++i]);
  } else if (args[i] === '--join' || args[i] === '-j') {
    joinPath = resolveDataPath(args[++i]);
  } else if (!dataPath) {
    dataPath = resolveDataPath(args[i]);
  }
}

render(h(App, { initialDataPath: dataPath, initialJoinPath: joinPath }));
