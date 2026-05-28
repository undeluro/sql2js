#!/usr/bin/env node

// ──────────────────────────────────────────────
// sql2js — CLI Entry Point
//
// Usage:
//   node src/index.js                           → launches TUI
//   node src/index.js -d data/users.json        → launches TUI with data preloaded
//   node src/index.js -e "SELECT ..." -d file   → one-shot execution (no TUI)
// ──────────────────────────────────────────────

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import chalk from 'chalk';
import { formatCompilerError } from './errors/errors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);

// Parse CLI args
let dataPath = null;
let joinPath = null;
let queryStr = null;
let showHelp = false;
let debugMode = false;
let extendedDebugMode = false;
let outputPath = null;
let writeDatasetPath = null;

function printExtendedDebug(res) {
  console.error(chalk.gray('\n--- Tokens ---'));
  if (res.tokens?.length) {
    for (const [index, token] of res.tokens.entries()) {
      const pos = `${token.line}:${token.column}`;
      console.error(`${String(index).padStart(3, ' ')}  ${token.type.padEnd(14)} ${pos.padEnd(7)} ${JSON.stringify(token.text)}`);
    }
  } else {
    console.error('(no tokens)');
  }

  console.error(chalk.gray('\n--- AST ---'));
  console.error(res.ast ? JSON.stringify(res.ast, null, 2) : '(AST not available)');

  console.error(chalk.gray('\n--- Generated JS ---'));
  console.error(res.code || '(code not generated)');
  console.error(chalk.gray('--- End Extended Debug ---\n'));
}

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--data': case '-d':
      dataPath = resolve(process.cwd(), args[++i]);
      break;
    case '--join': case '-j':
      joinPath = resolve(process.cwd(), args[++i]);
      break;
    case '--execute': case '-e':
      queryStr = args[++i];
      break;
    case '--output': case '-o':
      outputPath = resolve(process.cwd(), args[++i]);
      break;
    case '--write-dataset':
      writeDatasetPath = resolve(process.cwd(), args[++i]);
      break;
    case '--debug': case '-dbg':
      debugMode = true;
      break;
    case '--ex-debug': case '-edbg':
      extendedDebugMode = true;
      break;
    case '--help': case '-h':
      showHelp = true;
      break;
    default:
      if (!dataPath) dataPath = resolve(process.cwd(), args[i]);
      break;
  }
}

if (showHelp) {
  console.log(`
${chalk.bold.hex('#7C3AED')('⚡ sql2js')} ${chalk.gray('— SQL-to-JS Compiler for JSON')}

${chalk.bold('Usage:')}
  sql2js                              Launch interactive TUI
  sql2js -d data.json                 TUI with data preloaded
  sql2js -e "SELECT ..." -d data.json One-shot execution

${chalk.bold('Options:')}
  -d, --data <file>       JSON data file
  -j, --join <file>       Second JSON file for JOIN
  -e, --execute <query>   Execute query and print result
  -o, --output <file>     Write final result as pretty JSON
  --write-dataset <file>  Write full modified dataset as pretty JSON
  -dbg, --debug           Print generated JavaScript in one-shot mode
  -edbg, --ex-debug       Print tokens, AST, and generated JavaScript
  -h, --help              Show this help

${chalk.bold('Examples:')}
  sql2js -d users.json
  sql2js -e "SELECT name, age FROM users WHERE age > 18;" -d users.json
  sql2js -e "SELECT name FROM users;" -d users.json --debug
  sql2js -e "SELECT name FROM users;" -d users.json --ex-debug
  sql2js -e "SELECT u.name, o.product FROM users AS u JOIN orders AS o ON u.id = o.userId;" -d users.json -j orders.json
  `);
  process.exit(0);
}

// One-shot execution mode
if (queryStr) {
  if (!dataPath) {
    console.error(chalk.red('Error: --data/-d is required for --execute/-e mode'));
    process.exit(1);
  }

  const { compileAndExecute } = await import('./pipeline.js');
  const q = queryStr.endsWith(';') ? queryStr : queryStr + ';';
  const res = compileAndExecute(q, dataPath, joinPath);

  if (extendedDebugMode) {
    printExtendedDebug(res);
  }

  if (res.errors.length > 0) {
    for (const e of res.errors) {
      console.error(chalk.red(formatCompilerError(e, q)));
    }
    process.exit(1);
  }

  // Print generated code if running with --debug/-dbg
  if (debugMode && !extendedDebugMode) {
    console.error(chalk.gray('\n--- Generated JS ---'));
    console.error(res.code);
    console.error(chalk.gray('--- End ---\n'));
  }

  if (outputPath) {
    writeJsonFile(outputPath, res.result);
  }

  if (writeDatasetPath) {
    writeJsonFile(writeDatasetPath, res.dataset);
  }

  if (!outputPath && !writeDatasetPath) {
    console.log(JSON.stringify(res.result, null, 2));
  }
  process.exit(0);
}

// Interactive TUI mode
await import('./tui/app.js');

function writeJsonFile(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}
