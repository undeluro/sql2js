// Quick test script — verify the compiler pipeline and runtime behavior

import { compile, compileAndExecute, createDatabaseSession, executeProgram } from './pipeline.js';
import { formatTable } from './tui/theme.js';
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

runTest('JOIN variants produce clean SELECT * output', () => {
  const file = writeJson('join-variants.json', {
    users: [
      { id: 1, name: 'Ala' },
      { id: 2, name: 'Ola' },
    ],
    people: [
      { id: 1, name: 'Jan' },
      { id: 3, name: 'Ewa' },
    ],
  });

  const inner = compileAndExecute('SELECT * FROM users AS u INNER JOIN people AS p ON u.id = p.id;', file);
  assertNoErrors(inner);
  assert(inner.result.length === 1, `Expected 1 inner row, got ${inner.result.length}`);
  assert(!Object.keys(inner.result[0]).some(key => key.startsWith('__')), 'Expected internal alias fields to be hidden');
  assert(inner.result[0].name === 'Ala', 'Expected left field to keep original name');
  assert(inner.result[0]['p.name'] === 'Jan', 'Expected conflicting right field to be prefixed');

  const left = compileAndExecute('SELECT * FROM users AS u LEFT JOIN people AS p ON u.id = p.id;', file);
  assertNoErrors(left);
  assert(left.result.length === 2, `Expected 2 left rows, got ${left.result.length}`);
  assert(left.result.some(row => row.id === 2 && row.name === 'Ola'), 'Expected unmatched left row');

  const right = compileAndExecute('SELECT * FROM users AS u RIGHT JOIN people AS p ON u.id = p.id;', file);
  assertNoErrors(right);
  assert(right.result.length === 2, `Expected 2 right rows, got ${right.result.length}`);
  assert(right.result.some(row => row.id === 3 && row.name === 'Ewa'), 'Expected unmatched right row');

  const full = compileAndExecute('SELECT * FROM users AS u FULL JOIN people AS p ON u.id = p.id;', file);
  assertNoErrors(full);
  assert(full.result.length === 3, `Expected 3 full rows, got ${full.result.length}`);
});

runTest('NATURAL JOIN uses common top-level fields', () => {
  const file = writeJson('natural-join.json', {
    lefts: [
      { id: 1, code: 'x', leftValue: 'L1' },
      { id: 2, code: 'y', leftValue: 'L2' },
    ],
    rights: [
      { id: 1, code: 'x', rightValue: 'R1' },
      { id: 2, code: 'z', rightValue: 'R2' },
    ],
    unrelated: [
      { other: 1 },
    ],
  });

  const natural = compileAndExecute('SELECT * FROM lefts NATURAL JOIN rights;', file);
  assertNoErrors(natural);
  assert(natural.result.length === 1, `Expected 1 natural row, got ${natural.result.length}`);
  assert(natural.result[0].leftValue === 'L1' && natural.result[0].rightValue === 'R1', 'Expected matching natural row');

  const invalid = compileAndExecute('SELECT * FROM lefts NATURAL JOIN unrelated;', file);
  assertHasError(invalid, 'has no common top-level fields');
});

runTest('Set operations are distinct and support final ORDER BY and LIMIT', () => {
  const file = writeJson('set-ops.json', {
    a: [{ name: 'A' }, { name: 'B' }, { name: 'B' }],
    b: [{ name: 'B' }, { name: 'C' }],
  });

  const union = compileAndExecute('SELECT name FROM a UNION SELECT name FROM b ORDER BY name LIMIT 2;', file);
  assertNoErrors(union);
  assert(union.result.map(row => row.name).join(',') === 'A,B', 'Expected distinct UNION with final ORDER BY/LIMIT');

  const intersect = compileAndExecute('SELECT name FROM a INTERSECT SELECT name FROM b;', file);
  assertNoErrors(intersect);
  assert(intersect.result.length === 1 && intersect.result[0].name === 'B', 'Expected INTERSECT to keep common row');

  const except = compileAndExecute('SELECT name FROM a EXCEPT SELECT name FROM b;', file);
  assertNoErrors(except);
  assert(except.result.length === 1 && except.result[0].name === 'A', 'Expected EXCEPT to remove right rows');
});

runTest('LIKE and ILIKE support wildcards, negation, and escaping', () => {
  const file = writeJson('like.json', {
    items: [
      { name: 'Alicja' },
      { name: 'alicja' },
      { name: 'A_1' },
      { name: 'Ab1' },
    ],
  });

  const like = compileAndExecute("SELECT name FROM items WHERE name LIKE 'Ali%';", file);
  assertNoErrors(like);
  assert(like.result.length === 1 && like.result[0].name === 'Alicja', 'Expected case-sensitive LIKE');

  const ilike = compileAndExecute("SELECT name FROM items WHERE name ILIKE 'ali%';", file);
  assertNoErrors(ilike);
  assert(ilike.result.length === 2, 'Expected case-insensitive ILIKE');

  const escaped = compileAndExecute("SELECT name FROM items WHERE name LIKE 'A\\_%';", file);
  assertNoErrors(escaped);
  assert(escaped.result.length === 1 && escaped.result[0].name === 'A_1', 'Expected escaped underscore to be literal');

  const negated = compileAndExecute("SELECT name FROM items WHERE name NOT ILIKE 'ali%';", file);
  assertNoErrors(negated);
  assert(negated.result.length === 2, 'Expected NOT ILIKE to negate the match');
});

runTest('Table formatting includes later columns and compact JSON cells', () => {
  const table = formatTable([
    { id: 1, address: { city: 'Warszawa' } },
    { id: 2, extra: ['x'] },
  ], ['id']);

  assert(table.includes('address'), 'Expected table to include columns from later object keys');
  assert(table.includes('extra'), 'Expected table to include later-row columns');
  assert(table.includes('{"city":"Warszawa"}'), 'Expected object cell to be JSON');
  assert(table.includes('["x"]'), 'Expected array cell to be JSON');
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
  });
  const result = compileAndExecute('SELECT total FROM orders;', file);
  assertNoErrors(result);
  assert(result.result[0].total === 100, 'Expected order collection from object root');
});

runTest('Accepts empty database object for new databases', () => {
  const file = writeJson('empty.json', {});
  const session = createDatabaseSession(file);
  const result = executeProgram("CREATE COLLECTION people FROM [{ id: 1, name: 'Ala' }]; SELECT name FROM people;", session);
  assertNoErrors(result);
  assert(result.result[0].name === 'Ala', 'Expected CREATE COLLECTION to work in an empty database');
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
  assertHasError(result, "collection 'name' must be an array of objects");
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

runTest('-f executes .s2j files and --save persists the database', () => {
  const dbFile = join(tmpDir, 'script-db.json');
  const scriptFile = join(tmpDir, 'seed.s2j');
  writeFileSync(scriptFile, `
    CREATE COLLECTION people FROM [{ id: 1, name: 'Ala', age: 20 }];
    INSERT INTO people VALUE { id: 2, name: 'Ola', age: 21 };
    UPDATE people SET age = age + 1 WHERE id = 2;
    SELECT name, age FROM people ORDER BY id ASC;
  `, 'utf-8');

  const output = execFileSync(process.execPath, [
    resolve(rootDir, 'src/index.js'),
    '-f',
    scriptFile,
    '-d',
    dbFile,
    '--save',
  ], { cwd: rootDir, encoding: 'utf-8' });

  const selected = JSON.parse(output);
  const saved = JSON.parse(readFileSync(dbFile, 'utf-8'));
  assert(selected[1].age === 22, 'Expected .s2j result to include updated row');
  assert(saved.people[1].age === 22, 'Expected --save to persist script mutations');
});

runTest('-e and -f together fail clearly', () => {
  const scriptFile = join(tmpDir, 'noop.s2j');
  writeFileSync(scriptFile, 'SELECT * FROM users;', 'utf-8');

  let failed = false;
  try {
    execFileSync(process.execPath, [
      resolve(rootDir, 'src/index.js'),
      '-e',
      'SELECT * FROM users;',
      '-f',
      scriptFile,
      '-d',
      resolve(dataDir, 'users.json'),
    ], { cwd: rootDir, encoding: 'utf-8', stdio: 'pipe' });
  } catch (error) {
    failed = true;
    assert(String(error.stderr).includes('mutually exclusive'), 'Expected mutually exclusive error');
  }

  assert(failed, 'Expected command to fail');
});

console.log(`\nResults: ${passed}/${total} tests passed\n`);

if (passed !== total) {
  process.exit(1);
}
