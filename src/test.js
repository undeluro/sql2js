// Quick test script — verify the compiler pipeline and runtime behavior

import { compile, compileAndExecute } from './pipeline.js';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const dataDir = resolve(rootDir, 'data');
const tmpDir = mkdtempSync(join(tmpdir(), 'sql2js-tests-'));

let passed = 0;
let total = 0;

function runTest(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`✅ ${name}`);
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNoErrors(result) {
  assert(result.errors.length === 0, result.errors.map(String).join('\n'));
}

function assertHasError(result, text) {
  const messages = result.errors.map(String).join('\n');
  assert(messages.includes(text), `Expected error containing "${text}", got:\n${messages}`);
}

function execute(query, dataFile = 'users.json', joinFile = null) {
  return compileAndExecute(
    query,
    resolve(dataDir, dataFile),
    joinFile ? resolve(dataDir, joinFile) : null
  );
}

function writeJson(name, value) {
  const file = join(tmpDir, name);
  writeFileSync(file, JSON.stringify(value, null, 2), 'utf-8');
  return file;
}

// Existing SELECT behavior

runTest('SELECT filters nested paths', () => {
  const result = execute('SELECT name, address.city FROM users WHERE age > 18;');
  assertNoErrors(result);
  assert(result.result.length === 7, `Expected 7 rows, got ${result.result.length}`);
});

runTest('ORDER BY and LIMIT still work', () => {
  const result = execute('SELECT name, age FROM users ORDER BY age DESC LIMIT 3;');
  assertNoErrors(result);
  assert(result.result[0].age === 55, 'Expected oldest user first');
  assert(result.result.length === 3, 'Expected 3 rows');
});

runTest('UNNEST aliases work in SELECT and WHERE', () => {
  const result = execute("SELECT name, tag FROM users UNNEST(tags) AS tag WHERE tag = 'admin';");
  assertNoErrors(result);
  assert(result.result.length === 3, `Expected 3 admin tags, got ${result.result.length}`);
});

runTest('Aggregates still work', () => {
  const result = execute('SELECT name, COUNT(orders) FROM users WHERE COUNT(orders) > 2;');
  assertNoErrors(result);
  assert(result.result.length === 3, `Expected 3 rows, got ${result.result.length}`);
});

runTest('JOIN still works with a second JSON file', () => {
  const result = execute(
    'SELECT u.name, o.product FROM users AS u JOIN orders AS o ON u.id = o.userId WHERE o.total > 1000 LIMIT 2;',
    'users.json',
    'orders.json'
  );
  assertNoErrors(result);
  assert(result.result.length === 2, `Expected 2 joined rows, got ${result.result.length}`);
  assert(result.result[0]['u.name'], 'Expected aliased select output');
});

// JSON validation

runTest('Accepts top-level array of objects', () => {
  const result = execute('SELECT name FROM users LIMIT 1;');
  assertNoErrors(result);
  assert(result.result[0].name, 'Expected a selected name');
});

runTest('Accepts top-level object with collection arrays', () => {
  const file = writeJson('collections.json', {
    users: [{ id: 1, name: 'Ala' }],
    orders: [{ id: 10, userId: 1, total: 100 }],
    metadata: { source: 'test' },
  });
  const result = compileAndExecute('SELECT total FROM orders;', file);
  assertNoErrors(result);
  assert(result.result[0].total === 100, 'Expected order collection from object root');
});

runTest('Rejects array of primitives', () => {
  const result = execute('SELECT * FROM test;', 'test.json');
  assertHasError(result, 'root array must contain objects only');
});

runTest('Rejects mixed root arrays', () => {
  const file = writeJson('mixed.json', [{ id: 1 }, 2]);
  const result = compileAndExecute('SELECT id FROM mixed;', file);
  assertHasError(result, 'root array must contain objects only');
});

runTest('Rejects object with no collection arrays', () => {
  const file = writeJson('object.json', { name: 'Ala' });
  const result = compileAndExecute('SELECT name FROM object;', file);
  assertHasError(result, 'root object must contain at least one array-of-objects collection');
});

runTest('Rejects non-json file paths and directories', () => {
  const nonJson = compileAndExecute('SELECT name FROM README;', resolve(rootDir, 'README.md'));
  assertHasError(nonJson, 'expected an existing .json file');

  const directory = compileAndExecute('SELECT name FROM data;', dataDir);
  assertHasError(directory, 'expected an existing .json file');
  assert(statSync(dataDir).isDirectory(), 'Expected test fixture directory to exist');
});

// Parser and semantic coverage

runTest('Parses CREATE, INSERT, UPDATE, DELETE, SELECT, JOIN, UNNEST, ORDER BY, LIMIT', () => {
  const queries = [
    "CREATE COLLECTION users FROM [{ id: 1, name: 'Ala' }];",
    "INSERT INTO users VALUE { id: 2, name: 'Ola' };",
    "UPDATE users SET age = age + 1 WHERE name = 'Ala';",
    'DELETE FROM users WHERE age < 18;',
    'SELECT name FROM users UNNEST(tags) AS tag ORDER BY name ASC LIMIT 1;',
    'SELECT u.name, o.product FROM users AS u JOIN orders AS o ON u.id = o.userId;',
  ];

  for (const query of queries) {
    const result = compile(query);
    assertNoErrors(result);
  }
});

runTest('Semantic checks reject unknown collections and paths', () => {
  assertHasError(execute('SELECT name FROM missing;'), "unknown collection 'missing'");
  assertHasError(execute("INSERT INTO missing VALUE { id: 1 };"), "unknown collection 'missing'");
  assertHasError(execute('UPDATE missing SET id = 1;'), "unknown collection 'missing'");
  assertHasError(execute('DELETE FROM missing WHERE id = 1;'), "unknown collection 'missing'");
  assertHasError(execute('SELECT missingField FROM users;'), "Unknown path 'missingField'");
  assertHasError(execute('SELECT name FROM users UNNEST(age) AS item;'), 'UNNEST requires an array path');
});

// Mutation execution and output writing

runTest('CREATE, INSERT, UPDATE, DELETE execute sequentially', () => {
  const query = `
    CREATE COLLECTION people FROM [
      { id: 1, name: 'Ala', age: 20 },
      { id: 2, name: 'Jan', age: 17 }
    ];
    INSERT INTO people VALUE { id: 3, name: 'Ola', age: 21 };
    UPDATE people SET age = age + 1 WHERE name = 'Ala';
    DELETE FROM people WHERE age < 18;
    SELECT name, age FROM people ORDER BY id ASC;
  `;
  const result = execute(query);
  assertNoErrors(result);
  assert(result.result.length === 2, `Expected 2 people, got ${result.result.length}`);
  assert(result.result[0].age === 21, 'Expected Ala to be updated');
  assert(result.dataset.people.length === 2, 'Expected deleted row to be absent from dataset');
});

runTest('--output and --write-dataset write pretty JSON', () => {
  const outputFile = join(tmpDir, 'result.json');
  const datasetFile = join(tmpDir, 'dataset.json');
  execFileSync(process.execPath, [
    resolve(rootDir, 'src/index.js'),
    '-e',
    "INSERT INTO users VALUE { id: 99, name: 'Ola', age: 21 }; SELECT name, age FROM users WHERE id = 99;",
    '-d',
    resolve(dataDir, 'users.json'),
    '-o',
    outputFile,
    '--write-dataset',
    datasetFile,
  ], { cwd: rootDir });

  const output = JSON.parse(readFileSync(outputFile, 'utf-8'));
  const dataset = JSON.parse(readFileSync(datasetFile, 'utf-8'));
  assert(output[0].name === 'Ola', 'Expected selected result to be written');
  assert(dataset.users.some(user => user.id === 99), 'Expected modified dataset to be written');
});

console.log(`\nResults: ${passed}/${total} tests passed\n`);

if (passed !== total) {
  process.exit(1);
}
