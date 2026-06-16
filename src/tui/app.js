#!/usr/bin/env node

// ──────────────────────────────────────────────
// sql2js TUI — Minimalistic Interactive Terminal UI
// Uses React.createElement instead of JSX (no build step needed)
// ──────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { render, Box, Text, useApp, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import figlet from 'figlet';
import { compile, createDatabaseSession, executeProgram } from '../pipeline.js';
import { saveDatabase } from '../runtime/database.js';
import { formatCompilerError } from '../errors/errors.js';
import {
  colors, highlightSQL, highlightJS,
  pipelineBar, formatTable,
} from './theme.js';
import { extname, relative, resolve } from 'node:path';
import { existsSync, readdirSync, statSync } from 'node:fs';

const h = React.createElement;
const EXCLUDED_DIRS = new Set(['.git', 'node_modules']);
const TITLE = figlet.textSync('sql2js');

// ── Detect data file from CLI args ───────────
function resolveDatabasePath(arg) {
  if (!arg) return null;
  const normalized = arg.trim().replace(/^['"]|['"]$/g, '');
  const abs = resolve(process.cwd(), normalized);
  if (extname(abs).toLowerCase() !== '.json') return null;
  return !existsSync(abs) || statSync(abs).isFile() ? abs : null;
}

function findJsonFiles(rootDir = process.cwd()) {
  const files = [];

  function walk(dir) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const abs = resolve(dir, entry.name);

      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name)) {
          walk(abs);
        }
      } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.json') {
        files.push(abs);
      }
    }
  }

  walk(rootDir);
  return files.sort((a, b) => relative(rootDir, a).localeCompare(relative(rootDir, b)));
}

function formatFileLabel(filePath) {
  const rel = relative(process.cwd(), filePath);
  return rel && !rel.startsWith('..') ? rel : filePath;
}

function enterAlternateScreen() {
  if (!process.stdout.isTTY) return () => {};

  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    process.stdout.write('\x1b[?1049l');
  };
  const handleSignal = (exitCode) => {
    restore();
    process.exit(exitCode);
  };
  const handleSigint = () => handleSignal(130);
  const handleSigterm = () => handleSignal(143);
  const cleanup = () => {
    process.off('exit', restore);
    process.off('SIGINT', handleSigint);
    process.off('SIGTERM', handleSigterm);
  };

  process.stdout.write('\x1b[?1049h\x1b[H');
  process.once('exit', restore);
  process.once('SIGINT', handleSigint);
  process.once('SIGTERM', handleSigterm);

  return () => {
    cleanup();
    restore();
  };
}

// ── Main App Component ───────────────────────

function App({ initialDataPath, initialJoinPath }) {
  const { exit } = useApp();

  const [query, setQuery] = useState('');
  const [dataPathInput, setDataPathInput] = useState(initialDataPath || '');
  const [dataPath, setDataPath] = useState(initialDataPath || '');
  const [joinPath] = useState(initialJoinPath || '');
  const [session, setSession] = useState(null);
  const [joinSession, setJoinSession] = useState(null);
  const [result, setResult] = useState(null);
  const [mode, setMode] = useState(initialDataPath ? 'query' : 'data');
  const [history, setHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [dataError, setDataError] = useState(null);
  const [status, setStatus] = useState('');
  const jsonFiles = useMemo(() => findJsonFiles(), []);
  const dataItems = useMemo(() => jsonFiles.map(filePath => ({
    label: formatFileLabel(filePath),
    value: filePath,
  })).concat({ label: '+ Create new database...', value: '__create__' }), [jsonFiles]);

  useEffect(() => {
    if (initialDataPath) {
      openDatabase(initialDataPath);
    }
  }, []);

  useInput((input, key) => {
    if (key.ctrl && input === 'c') { exit(); return; }
    if (key.ctrl && input === 'q') { exit(); return; }

    if (mode === 'data') {
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

  function openDatabase(filePath) {
    const resolved = resolveDatabasePath(filePath);
    if (!resolved) {
      setDataError(filePath.trim()
        ? `Enter a .json database file path, not a directory: ${filePath.trim()}`
        : 'Enter a JSON database path, for example data/db.json');
      return;
    }

    try {
      const dbSession = createDatabaseSession(resolved);
      const dbJoinSession = joinPath ? createDatabaseSession(joinPath) : null;
      setSession(dbSession);
      setJoinSession(dbJoinSession);
      setDataPath(resolved);
      setDataPathInput(resolved);
      setDataError(null);
      setStatus(dbSession.created ? 'New database session initialized' : 'Database loaded');
      setMode('query');
    } catch (error) {
      setDataError(error.message);
    }
  }

  function executeQuery(q) {
    const trimmedQuery = q.trim();
    if (!trimmedQuery) return;
    const queryStr = trimmedQuery.endsWith(';') ? trimmedQuery : trimmedQuery + ';';
    setHistory(prev => [...prev, queryStr]);
    setHistoryIdx(-1);

    try {
      const compiled = compile(queryStr);
      if (compiled.errors.length > 0) {
        setResult({ query: queryStr, stages: compiled.stages, errors: compiled.errors, code: null, data: null, mutationSummary: '' });
      } else if (session) {
        const execResult = executeProgram(queryStr, session, { joinSession });
        if (execResult.errors.length === 0 && execResult.mutated) {
          saveDatabase(session);
          setStatus(`Saved - ${execResult.mutationSummary}`);
        } else if (execResult.errors.length === 0) {
          setStatus('Query executed');
        }
        setResult({
          query: queryStr,
          stages: execResult.stages,
          errors: execResult.errors,
          code: execResult.code || compiled.code,
          data: execResult.result,
          mutationSummary: execResult.mutationSummary,
        });
      } else {
        setResult({ query: queryStr, stages: compiled.stages, errors: [], code: compiled.code, data: null, mutationSummary: '' });
      }
    } catch (e) {
      setResult({
        query: queryStr,
        stages: [{ name: 'Error', status: 'error' }],
        errors: [{ phase: 'system', message: e.message }],
        code: null, data: null, mutationSummary: '',
      });
    }
    setMode('result');
  }

  // ── Render ─────────────────────────────────

  const children = [];

  // Header
  children.push(
    h(Box, { key: 'header', flexDirection: 'column', marginBottom: 1 },
      h(Text, null, colors.primary(TITLE)),
      h(Text, null,
        `${colors.primary('⚡')} ${colors.muted('SQL-to-JS Compiler for JSON')}`
      )
    )
  );

  // Data file input mode
  if (mode === 'data') {
    if (dataItems.length > 0) {
      children.push(
        h(Box, { key: 'data-mode', flexDirection: 'column' },
          h(Text, null, colors.secondary('📂 Select JSON data file:')),
          h(Box, { marginTop: 1 },
            h(SelectInput, {
              items: dataItems,
              isFocused: mode === 'data',
              limit: Math.min(10, dataItems.length),
              onSelect: item => {
                if (item.value === '__create__') {
                  setDataPathInput('');
                  setDataError(null);
                  setMode('dataPath');
                } else {
                  openDatabase(item.value);
                }
              },
            })
          ),
          dataError && h(Box, { marginTop: 1 },
            h(Text, null, colors.error(dataError))
          ),
          h(Box, { marginTop: 1 },
            h(Text, null, colors.dimText('↑↓ or j/k to choose - Enter to confirm - Ctrl+C to exit'))
          )
        )
      );
    }
  }

  if (mode === 'dataPath') {
    children.push(
      h(Box, { key: 'data-path-mode', flexDirection: 'column' },
        h(Text, null, colors.secondary('📂 Enter database JSON path:')),
        h(Box, { marginTop: 1 },
          h(Text, null, colors.muted('> ')),
          h(TextInput, {
            value: dataPathInput,
            onChange: value => {
              setDataError(null);
              setDataPathInput(value);
            },
            onSubmit: openDatabase,
            showCursor: true,
          })
        ),
        dataError && h(Box, { marginTop: 1 },
          h(Text, null, colors.error(dataError))
        ),
        h(Box, { marginTop: 1 },
          h(Text, null, colors.dimText('Example: data/db.json - missing .json files are created on first save'))
        )
      )
    );
  }

  // Query input mode
  if (mode === 'query') {
    children.push(
      h(Box, { key: 'query-mode', flexDirection: 'column' },
        h(Text, null, colors.muted(`📂 ${dataPath ? dataPath.split(/[\\/]/).pop() : 'no file'}`)),
        status && h(Text, null, colors.dimText(status)),
        h(Box, { marginTop: 1 },
          h(Text, null, colors.secondary('Query: ')),
          h(TextInput, {
            value: query,
            onChange: setQuery,
            onSubmit: executeQuery,
            showCursor: true,
          })
        ),
        h(Box, { marginTop: 1 },
          h(Text, null, colors.dimText('Enter to run • ←→ edit • ↑↓ history • Ctrl+Q quit'))
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

    if (result.mutationSummary && result.errors.length === 0) {
      resultChildren.push(
        h(Box, { key: 'mutation-summary', marginTop: 1 },
          h(Text, null, colors.success(result.mutationSummary))
        )
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
    } else if (result.data) {
      resultChildren.push(
        h(Box, { key: 'json-result', flexDirection: 'column', marginTop: 1 },
          h(Text, { key: 'json-title' }, colors.muted('Result JSON:')),
          h(Text, { key: 'json-body' }, JSON.stringify(result.data, null, 2))
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
    dataPath = resolveDatabasePath(args[++i]);
  } else if (args[i] === '--join' || args[i] === '-j') {
    joinPath = resolveDatabasePath(args[++i]);
  } else if (!dataPath) {
    dataPath = resolveDatabasePath(args[i]);
  }
}

const restoreAlternateScreen = enterAlternateScreen();
const inkApp = render(h(App, { initialDataPath: dataPath, initialJoinPath: joinPath }));
inkApp.waitUntilExit().then(restoreAlternateScreen, restoreAlternateScreen);
