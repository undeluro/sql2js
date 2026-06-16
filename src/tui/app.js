#!/usr/bin/env node

// ──────────────────────────────────────────────
// sql2js TUI — Minimalistic Interactive Terminal UI
// Uses React.createElement instead of JSX (no build step needed)
// ──────────────────────────────────────────────

import React, { useEffect, useMemo, useRef, useState } from 'react';
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

function getTerminalSize() {
  return {
    columns: process.stdout.columns || 100,
    rows: process.stdout.rows || 30,
  };
}

function useTerminalSize() {
  const [terminal, setTerminal] = useState(getTerminalSize);

  useEffect(() => {
    if (!process.stdout.isTTY) return undefined;
    const handleResize = () => setTerminal(getTerminalSize());
    process.stdout.on('resize', handleResize);
    return () => process.stdout.off('resize', handleResize);
  }, []);

  return terminal;
}

function getCollectionSummaries(dbSession) {
  return Object.entries(dbSession?.data || {}).map(([name, rows]) => ({
    name,
    count: Array.isArray(rows) ? rows.length : 0,
  }));
}

function QueryEditor({ value, onChange, onSubmit, onHistoryPrev, onHistoryNext, isActive }) {
  const [cursor, setCursor] = useState(value.length);
  const internalChange = useRef(false);

  useEffect(() => {
    if (internalChange.current) {
      internalChange.current = false;
    } else {
      setCursor(value.length);
    }
  }, [value]);

  useInput((input, key) => {
    if (!isActive) return;

    if (key.return) {
      onSubmit(value);
      return;
    }

    if (key.upArrow) {
      onHistoryPrev();
      return;
    }

    if (key.downArrow) {
      onHistoryNext();
      return;
    }

    if (key.leftArrow) {
      setCursor(current => Math.max(0, current - 1));
      return;
    }

    if (key.rightArrow) {
      setCursor(current => Math.min(value.length, current + 1));
      return;
    }

    if (key.backspace || key.delete) {
      if (cursor === 0) return;
      internalChange.current = true;
      onChange(value.slice(0, cursor - 1) + value.slice(cursor));
      setCursor(current => Math.max(0, current - 1));
      return;
    }

    if (!key.ctrl && !key.meta && input) {
      internalChange.current = true;
      onChange(value.slice(0, cursor) + input + value.slice(cursor));
      setCursor(current => current + input.length);
    }
  }, { isActive });

  const before = value.slice(0, cursor);
  const current = value[cursor];
  const after = value.slice(cursor + (current ? 1 : 0));
  const renderedCursor = current ? colors.primary.inverse(current) : colors.primary('█');

  return h(Text, null, `${highlightSQL(before)}${renderedCursor}${highlightSQL(after)}`);
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
  const [lastOutput, setLastOutput] = useState(null);
  const [showCode, setShowCode] = useState(false);
  const [mode, setMode] = useState(initialDataPath ? 'query' : 'data');
  const [history, setHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [dataError, setDataError] = useState(null);
  const [status, setStatus] = useState('');
  const terminal = useTerminalSize();
  const [jsonFiles, setJsonFiles] = useState(() => findJsonFiles());
  const dataItems = useMemo(() => jsonFiles.map(filePath => ({
    label: formatFileLabel(filePath),
    value: filePath,
  })), [jsonFiles]);
  const databaseItems = useMemo(() => ([
    { label: '+ Create new database...', value: '__create__' },
    ...dataItems,
  ]), [dataItems]);

  useEffect(() => {
    if (initialDataPath) {
      openDatabase(initialDataPath);
    }
  }, []);

  useInput((input, key) => {
    if (key.ctrl && input === 'c') { exit(); return; }
    if (key.ctrl && input === 'q') { exit(); return; }
    if (key.ctrl && input === 'd') { setShowCode(value => !value); return; }
    if (key.ctrl && input === 'o') { openDatabasePicker(); return; }
    if (key.escape && session && (mode === 'data' || mode === 'dataPath')) {
      setDataError(null);
      setDataPathInput(dataPath);
      setMode('query');
    }
  });

  function openDatabasePicker() {
    setJsonFiles(findJsonFiles());
    setDataError(null);
    setMode('data');
  }

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
      setQuery('');
      setLastOutput(null);
      setShowCode(false);
      setHistory([]);
      setHistoryIdx(-1);
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
        setStatus('Command failed');
        setLastOutput({ query: queryStr, stages: compiled.stages, errors: compiled.errors, code: null, data: null, mutationSummary: '', mutated: false });
      } else if (session) {
        const execResult = executeProgram(queryStr, session, { joinSession });
        if (execResult.errors.length === 0 && execResult.mutated) {
          saveDatabase(session);
          setStatus(`Saved - ${execResult.mutationSummary}`);
        } else if (execResult.errors.length === 0) {
          setStatus('Query executed');
        } else {
          setStatus('Command failed');
        }
        setLastOutput({
          query: queryStr,
          stages: execResult.stages,
          errors: execResult.errors,
          code: execResult.code || (execResult.errors.length === 0 ? compiled.code : null),
          data: execResult.result,
          mutationSummary: execResult.mutationSummary,
          mutated: Boolean(execResult.mutated),
        });
      } else {
        setStatus('Compiled');
        setLastOutput({ query: queryStr, stages: compiled.stages, errors: [], code: compiled.code, data: null, mutationSummary: '', mutated: false });
      }
    } catch (e) {
      setStatus('Command failed');
      setLastOutput({
        query: queryStr,
        stages: [{ name: 'Error', status: 'error' }],
        errors: [{ phase: 'system', message: e.message }],
        code: null, data: null, mutationSummary: '', mutated: false,
      });
    }
    setQuery('');
    setMode('query');
  }

  function navigateHistoryPrev() {
    if (history.length === 0) return;
    const idx = historyIdx < history.length - 1 ? historyIdx + 1 : historyIdx;
    setHistoryIdx(idx);
    setQuery(history[history.length - 1 - idx]);
  }

  function navigateHistoryNext() {
    if (historyIdx > 0) {
      setHistoryIdx(historyIdx - 1);
      setQuery(history[history.length - historyIdx]);
    } else {
      setHistoryIdx(-1);
      setQuery('');
    }
  }

  // ── Render ─────────────────────────────────

  const isSplit = terminal.columns >= 100;
  const paneWidth = isSplit
    ? Math.max(38, Math.floor((terminal.columns - 2) / 2))
    : Math.max(40, terminal.columns - 2);
  const rightPaneWidth = Math.max(24, paneWidth - (isSplit ? 4 : 2));

  function renderDatabaseSummary(key = 'db-summary', includeHeading = true) {
    if (!session) {
      return h(Box, { key, flexDirection: 'column' },
        includeHeading && h(Text, null, colors.secondary('Database')),
        h(Text, null, colors.dimText('Select or create a database to begin.'))
      );
    }

    const collections = getCollectionSummaries(session);
    const summaryChildren = [];
    if (includeHeading) summaryChildren.push(h(Text, { key: 'summary-title' }, colors.secondary('Database')));
    summaryChildren.push(
      h(Text, { key: 'summary-path' }, `${colors.muted('Path:')} ${formatFileLabel(session.filePath)}`),
      h(Text, { key: 'summary-status' }, `${colors.muted('Status:')} ${status || (session.created ? 'New database session' : 'Loaded')}`),
      h(Box, { key: 'summary-collections-title', marginTop: 1 },
        h(Text, null, colors.muted('Collections:'))
      )
    );

    if (collections.length === 0) {
      summaryChildren.push(
        h(Text, { key: 'summary-empty' }, colors.dimText('  (no collections yet)'))
      );
    } else {
      collections.forEach(collection => {
        summaryChildren.push(
          h(Text, { key: `summary-${collection.name}` },
            `  ${colors.secondary(collection.name)} ${colors.dimText(`${collection.count} row${collection.count === 1 ? '' : 's'}`)}`
          )
        );
      });
    }

    return h(Box, { key, flexDirection: 'column' }, ...summaryChildren);
  }

  function renderLeftPane() {
    const children = [
      h(Box, { key: 'header', flexDirection: 'column', marginBottom: 1 },
        h(Text, null, colors.primary(TITLE)),
        h(Text, null, `${colors.primary('⚡')} ${colors.muted('SQL-to-JS Compiler for JSON')}`)
      ),
    ];

    if (mode === 'data') {
      children.push(
        h(Box, { key: 'data-mode', flexDirection: 'column' },
          h(Text, null, colors.secondary('📂 Select JSON data file:')),
          h(Box, { marginTop: 1 },
            h(SelectInput, {
              items: databaseItems,
              isFocused: mode === 'data',
              limit: Math.min(10, databaseItems.length),
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
            h(Text, null, colors.dimText(`↑↓ or j/k choose - Enter confirm${session ? ' - Esc cancel' : ''} - Ctrl+C exit`))
          )
        )
      );
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
            h(Text, null, colors.dimText(`Example: data/db.json - missing .json files are created on first save${session ? ' - Esc cancel' : ''}`))
          )
        )
      );
    }

    if (mode === 'query') {
      children.push(
        h(Box, { key: 'query-mode', flexDirection: 'column' },
          h(Text, null, colors.muted(`📂 ${dataPath ? dataPath.split(/[\\/]/).pop() : 'no file'}`)),
          status && h(Text, null, colors.dimText(status)),
          h(Box, { marginTop: 1 },
            h(Text, null, colors.secondary('> ')),
            h(QueryEditor, {
              value: query,
              onChange: setQuery,
              onSubmit: executeQuery,
              onHistoryPrev: navigateHistoryPrev,
              onHistoryNext: navigateHistoryNext,
              isActive: mode === 'query',
            })
          ),
          h(Box, { marginTop: 1 },
            h(Text, null, colors.dimText('Enter run - ←→ edit - ↑↓ history - Ctrl+O switch DB - Ctrl+D JS - Ctrl+Q quit'))
          )
        )
      );
    }

    if (showCode && lastOutput?.code) {
      children.push(
        h(Box, { key: 'codegen', flexDirection: 'column', marginTop: 1 },
          h(Text, null, colors.muted('Generated JS:')),
          h(Text, null, highlightJS(lastOutput.code))
        )
      );
    }

    return h(Box, { key: 'left-pane', flexDirection: 'column', width: paneWidth, flexShrink: 0 }, ...children);
  }

  function renderErrors(output) {
    if (!output.errors || output.errors.length === 0) return null;

    const errorItems = [
      h(Text, { key: 'err-title' }, colors.error('Errors:')),
    ];

    output.errors.forEach((error, index) => {
      const formatted = formatCompilerError(error, output.query)
        .split('\n')
        .map(line => `  ${line}`)
        .join('\n');
      errorItems.push(
        h(Text, { key: `err-${index}` }, colors.error(formatted))
      );
    });

    return h(Box, { key: 'errors', flexDirection: 'column', marginTop: 1 }, ...errorItems);
  }

  function renderResultData(output) {
    if (!output.data) return null;

    if (Array.isArray(output.data)) {
      if (output.data.length === 0) {
        return h(Box, { key: 'no-results', marginTop: 1 },
          h(Text, null, colors.dimText('  (no matching rows)'))
        );
      }

      return h(Box, { key: 'results', flexDirection: 'column', marginTop: 1 },
        h(Text, null, colors.muted(`Results (${output.data.length} rows):`)),
        h(Text, null, formatTable(output.data, Object.keys(output.data[0]), rightPaneWidth))
      );
    }

    return h(Box, { key: 'json-result', flexDirection: 'column', marginTop: 1 },
      h(Text, null, colors.muted('Result JSON:')),
      h(Text, null, JSON.stringify(output.data, null, 2))
    );
  }

  function renderRightPane() {
    const children = [
      h(Text, { key: 'output-title' }, colors.secondary('Output')),
    ];

    if (!lastOutput) {
      children.push(
        h(Box, { key: 'initial-summary', marginTop: 1, flexDirection: 'column' },
          renderDatabaseSummary('initial-db-summary', false)
        )
      );
      return h(Box, rightPaneProps(), ...children);
    }

    children.push(
      h(Box, { key: 'query-echo', marginTop: 1 },
        h(Text, null, `${colors.muted('Query:')} ${highlightSQL(lastOutput.query)}`)
      ),
      h(Box, { key: 'pipeline', marginTop: 1 },
        h(Text, null, `${colors.muted('Pipeline:')} ${pipelineBar(lastOutput.stages)}`)
      )
    );

    const errors = renderErrors(lastOutput);
    if (errors) children.push(errors);

    if (lastOutput.mutationSummary && lastOutput.errors.length === 0) {
      children.push(
        h(Box, { key: 'mutation-summary', marginTop: 1 },
          h(Text, null, colors.success(lastOutput.mutationSummary))
        ),
        h(Box, { key: 'mutation-db-summary', marginTop: 1, flexDirection: 'column' },
          renderDatabaseSummary('mutation-summary-body', true)
        )
      );
    } else {
      const resultData = renderResultData(lastOutput);
      if (resultData) children.push(resultData);
    }

    return h(Box, rightPaneProps(), ...children);
  }

  function rightPaneProps() {
    const props = {
      key: 'right-pane',
      flexDirection: 'column',
      width: paneWidth,
      flexShrink: 0,
    };

    if (isSplit) {
      return {
        ...props,
        height: terminal.rows,
        borderStyle: 'single',
        borderTop: false,
        borderRight: false,
        borderBottom: false,
        borderLeft: true,
        borderColor: '#6B7280',
        paddingLeft: 1,
      };
    }

    return props;
  }

  function renderDivider() {
    return h(Box, { key: 'horizontal-divider', marginY: 1 },
      h(Text, null, colors.muted('─'.repeat(Math.max(1, terminal.columns - 2))))
    );
  }

  return h(Box, { flexDirection: isSplit ? 'row' : 'column', paddingX: 1, height: terminal.rows },
    renderLeftPane(),
    !isSplit && renderDivider(),
    renderRightPane()
  );
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
