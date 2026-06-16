#!/usr/bin/env node

// ──────────────────────────────────────────────
// sql2js — CLI Entry Point
//
// Usage:
//   node src/index.js                           → launches TUI
//   node src/index.js -d data/users.json        → launches TUI with data preloaded
//   node src/index.js -e "SELECT ..." -d file   → one-shot execution (no TUI)
// ──────────────────────────────────────────────

import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import chalk from 'chalk';
import { formatCompilerError } from './errors/errors.js';
import { saveDatabase } from './runtime/database.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);

// Parse CLI args
let dataPath = null;
let joinPath = null;
let queryStr = null;
let scriptPath = null;
let showHelp = false;
let debugMode = false;
let extendedDebugMode = false;
let outputPath = null;
let writeDatasetPath = null;
let saveToInput = false;

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
    case '--file': case '-f':
      scriptPath = resolve(process.cwd(), args[++i]);
      break;
    case '--output': case '-o':
      outputPath = resolve(process.cwd(), args[++i]);
      break;
    case '--write-dataset':
      writeDatasetPath = resolve(process.cwd(), args[++i]);
      break;
    case '--save':
      saveToInput = true;
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
  sql2js -f commands.s2j -d data.json Execute command file

${chalk.bold('Options:')}
  -d, --data <file>       JSON data file
  -j, --join <file>       Second JSON file for JOIN
  -e, --execute <query>   Execute query and print result
  -f, --file <file.s2j>   Execute statements from a sql2js script file
  -o, --output <file>     Write final result as pretty JSON
  --write-dataset <file>  Write full modified dataset as pretty JSON
  --save                  Persist mutations back to --data database file
  -dbg, --debug           Print generated JavaScript in one-shot mode
  -edbg, --ex-debug       Print tokens, AST, and generated JavaScript
  -h, --help              Show this help

${chalk.bold('Examples:')}
  sql2js -d users.json
  sql2js -e "SELECT name, age FROM users WHERE age > 18;" -d users.json
  sql2js -e "SELECT name FROM users;" -d users.json --debug
  sql2js -e "SELECT name FROM users;" -d users.json --ex-debug
  sql2js -f scripts/seed.s2j -d db.json --save
  sql2js -e "SELECT u.name, o.product FROM users AS u JOIN orders AS o ON u.id = o.userId;" -d users.json -j orders.json
  `);
  process.exit(0);
}

// One-shot execution mode
if (queryStr || scriptPath) {
  if (queryStr && scriptPath) {
    console.error(chalk.red('Error: --execute/-e and --file/-f are mutually exclusive'));
    process.exit(1);
  }

  if (!dataPath) {
    console.error(chalk.red('Error: --data/-d is required for --execute/-e and --file/-f modes'));
    process.exit(1);
  }

  if (scriptPath && extname(scriptPath).toLowerCase() !== '.s2j') {
    console.error(chalk.red('Error: --file/-f expects a .s2j script file'));
    process.exit(1);
  }

  const { createDatabaseSession, executeProgram } = await import('./pipeline.js');
  const input = scriptPath
    ? readFileSync(scriptPath, 'utf-8')
    : queryStr.endsWith(';') ? queryStr : queryStr + ';';
  const session = createDatabaseSession(dataPath);
  const joinSession = joinPath ? createDatabaseSession(joinPath) : null;
  const res = executeProgram(input, session, { joinSession });

  if (extendedDebugMode) {
    printExtendedDebug(res);
  }

  if (res.errors.length > 0) {
    for (const e of res.errors) {
      console.error(chalk.red(formatCompilerError(e, input)));
    }
    process.exit(1);
  }

  // Print generated code if running with --debug/-dbg
  if (debugMode && !extendedDebugMode) {
    console.error(chalk.gray('\n--- Generated JS ---'));
    console.error(res.code);
    console.error(chalk.gray('--- End ---\n'));
  }

  if (saveToInput && res.mutated) {
    saveDatabase(session, dataPath);
  }

  if (outputPath) {
    writeJsonFile(outputPath, res.result);
  }

  if (writeDatasetPath) {
    writeJsonFile(writeDatasetPath, session.data);
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
