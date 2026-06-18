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

function stripAnsi(value) {
  return value.replace(/\x1B\[[0-9;]*m/g, '');
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

runTest('ARRAY_COUNT handles scalar arrays, object arrays, empty arrays, and filters', () => {
  const file = writeJson('array-count.json', {
    metrics: [
      { id: 1, nums: [1, 2, 3], entries: [{ amount: 10 }, { amount: 20 }] },
      { id: 2, nums: [], entries: [] },
      { id: 3, nums: [-2, 0, 5], entries: [{ amount: -1 }] },
    ],
  });

  const result = compileAndExecute('SELECT id, ARRAY_COUNT(nums), ARRAY_COUNT(entries) FROM metrics ORDER BY id;', file);
  assertNoErrors(result);
  assert(result.result[0]['ARRAY_COUNT(nums)'] === 3, 'Expected ARRAY_COUNT to count scalar array values');
  assert(result.result[0]['ARRAY_COUNT(entries)'] === 2, 'Expected ARRAY_COUNT to count object array values');
  assert(result.result[1]['ARRAY_COUNT(nums)'] === 0, 'Expected ARRAY_COUNT to return 0 for empty arrays');
  assert(result.result[2]['ARRAY_COUNT(entries)'] === 1, 'Expected ARRAY_COUNT to handle different row lengths');

  const filtered = compileAndExecute('SELECT id FROM metrics WHERE ARRAY_COUNT(nums) > 0 ORDER BY id;', file);
  assertNoErrors(filtered);
  assert(filtered.result.map(row => row.id).join(',') === '1,3', 'Expected ARRAY_COUNT to work in WHERE');
});

runTest('ARRAY_SUM, ARRAY_AVG, ARRAY_MIN, and ARRAY_MAX support scalar arrays and object subfields', () => {
  const file = writeJson('array-aggregates.json', {
    metrics: [
      { id: 1, nums: [1, 2, 3.5], entries: [{ amount: 10 }, { amount: 20.5 }] },
      { id: 2, nums: [], entries: [] },
      { id: 3, nums: [-2, 0, 5], entries: [{ amount: -1 }, { amount: 4 }] },
    ],
  });

  const result = compileAndExecute('SELECT id, ARRAY_SUM(nums), ARRAY_AVG(nums), ARRAY_MIN(nums), ARRAY_MAX(nums), ARRAY_SUM(entries.amount), ARRAY_AVG(entries.amount), ARRAY_MIN(entries.amount), ARRAY_MAX(entries.amount) FROM metrics ORDER BY id;', file);
  assertNoErrors(result);
  assert(result.result[0]['ARRAY_SUM(nums)'] === 6.5, 'Expected ARRAY_SUM to add decimal scalar arrays');
  assert(result.result[0]['ARRAY_AVG(nums)'] === 6.5 / 3, 'Expected ARRAY_AVG to average scalar arrays');
  assert(result.result[0]['ARRAY_MIN(nums)'] === 1, 'Expected ARRAY_MIN to find scalar minimum');
  assert(result.result[0]['ARRAY_MAX(nums)'] === 3.5, 'Expected ARRAY_MAX to find scalar maximum');
  assert(result.result[0]['ARRAY_SUM(entries.amount)'] === 30.5, 'Expected ARRAY_SUM to add object subfields');
  assert(result.result[0]['ARRAY_AVG(entries.amount)'] === 15.25, 'Expected ARRAY_AVG to average object subfields');
  assert(result.result[1]['ARRAY_SUM(nums)'] === 0, 'Expected ARRAY_SUM to return 0 for empty arrays');
  assert(result.result[1]['ARRAY_AVG(nums)'] === 0, 'Expected ARRAY_AVG to return 0 for empty arrays');
  assert(result.result[1]['ARRAY_MIN(nums)'] === null, 'Expected ARRAY_MIN to return null for empty arrays');
  assert(result.result[1]['ARRAY_MAX(nums)'] === null, 'Expected ARRAY_MAX to return null for empty arrays');
  assert(result.result[2]['ARRAY_SUM(nums)'] === 3, 'Expected ARRAY_SUM to add negative numbers');
  assert(result.result[2]['ARRAY_MIN(entries.amount)'] === -1, 'Expected ARRAY_MIN to handle negative object subfields');
  assert(result.result[2]['ARRAY_MAX(entries.amount)'] === 4, 'Expected ARRAY_MAX to handle mixed-sign object subfields');
});

runTest('ARRAY_* functions work with source aliases and preserve schemas with empty first rows', () => {
  const file = writeJson('array-alias-empty-first.json', {
    users: [
      { id: 1, name: 'Empty', orders: [] },
      { id: 2, name: 'Ala', orders: [{ total: 7 }, { total: 8 }] },
    ],
  });

  const result = compileAndExecute('SELECT u.name, ARRAY_COUNT(u.orders), ARRAY_SUM(u.orders.total), ARRAY_AVG(u.orders.total), ARRAY_MIN(u.orders.total), ARRAY_MAX(u.orders.total) FROM users AS u ORDER BY u.id;', file);
  assertNoErrors(result);
  assert(result.result[0]['ARRAY_COUNT(u.orders)'] === 0, 'Expected ARRAY_COUNT to work with aliases');
  assert(result.result[0]['ARRAY_SUM(u.orders.total)'] === 0, 'Expected empty first row to allow ARRAY_SUM subfield');
  assert(result.result[0]['ARRAY_AVG(u.orders.total)'] === 0, 'Expected empty first row to allow ARRAY_AVG subfield');
  assert(result.result[0]['ARRAY_MIN(u.orders.total)'] === null, 'Expected empty first row to allow ARRAY_MIN subfield');
  assert(result.result[0]['ARRAY_MAX(u.orders.total)'] === null, 'Expected empty first row to allow ARRAY_MAX subfield');
  assert(result.result[1]['ARRAY_SUM(u.orders.total)'] === 15, 'Expected later non-empty rows to keep subfield schema');
  assert(result.result[1]['ARRAY_AVG(u.orders.total)'] === 7.5, 'Expected later non-empty rows to average correctly');
});

runTest('Group aggregates support COUNT star and row-level numeric functions', () => {
  const file = writeJson('group-aggregates.json', {
    users: [
      { id: 1, city: 'Warszawa', age: 20 },
      { id: 2, city: 'Warszawa', age: 30 },
      { id: 3, city: 'Krakow', age: 40 },
    ],
  });

  const result = compileAndExecute('SELECT city, COUNT(*), COUNT(age), SUM(age), AVG(age), MIN(age), MAX(age) FROM users GROUP BY city ORDER BY city ASC;', file);
  assertNoErrors(result);
  assert(result.result.length === 2, `Expected 2 city groups, got ${result.result.length}`);
  assert(result.result[0].city === 'Krakow' && result.result[0]['COUNT(*)'] === 1, 'Expected Krakow group count');
  assert(result.result[1].city === 'Warszawa' && result.result[1]['COUNT(*)'] === 2, 'Expected Warszawa group count');
  assert(result.result[1]['COUNT(age)'] === 2, 'Expected COUNT(field) to count non-null row values');
  assert(result.result[1]['SUM(age)'] === 50, 'Expected SUM(field) to sum row values');
  assert(result.result[1]['AVG(age)'] === 25, 'Expected AVG(field) to average row values');
  assert(result.result[1]['MIN(age)'] === 20, 'Expected MIN(field) to find group minimum');
  assert(result.result[1]['MAX(age)'] === 30, 'Expected MAX(field) to find group maximum');
});

runTest('Group aggregates work without GROUP BY as a whole-table aggregate', () => {
  const file = writeJson('whole-table-aggregate.json', {
    users: [
      { id: 1, age: 20 },
      { id: 2, age: null },
      { id: 3, age: 40 },
    ],
  });

  const result = compileAndExecute('SELECT COUNT(*), COUNT(age), SUM(age), AVG(age), MIN(age), MAX(age) FROM users;', file);
  assertNoErrors(result);
  assert(result.result.length === 1, 'Expected whole-table aggregate to return one row');
  assert(result.result[0]['COUNT(*)'] === 3, 'Expected COUNT(*) to count all rows');
  assert(result.result[0]['COUNT(age)'] === 2, 'Expected COUNT(field) to skip null values');
  assert(result.result[0]['SUM(age)'] === 60, 'Expected SUM(field) to skip null values');
  assert(result.result[0]['AVG(age)'] === 30, 'Expected AVG(field) to skip null values');
  assert(result.result[0]['MIN(age)'] === 20, 'Expected MIN(field) to skip null values');
  assert(result.result[0]['MAX(age)'] === 40, 'Expected MAX(field) to skip null values');
});

runTest('HAVING filters groups and can combine group aggregates with ARRAY_* expressions', () => {
  const file = writeJson('having-array-aggregate.json', {
    users: [
      { city: 'A', orders: [{ total: 5 }, { total: 7 }] },
      { city: 'A', orders: [] },
      { city: 'B', orders: [{ total: 3 }] },
    ],
  });

  const result = compileAndExecute('SELECT city, COUNT(*), SUM(ARRAY_SUM(orders.total)) FROM users GROUP BY city HAVING SUM(ARRAY_SUM(orders.total)) > 10 ORDER BY city;', file);
  assertNoErrors(result);
  assert(result.result.length === 1, `Expected 1 group after HAVING, got ${result.result.length}`);
  assert(result.result[0].city === 'A', 'Expected HAVING to keep city A');
  assert(result.result[0]['COUNT(*)'] === 2, 'Expected COUNT(*) inside HAVING query');
  assert(result.result[0]['SUM(ARRAY_SUM(orders.total))'] === 12, 'Expected SUM over per-row ARRAY_SUM values');
});

runTest('Group aggregate semantic checks reject invalid mixes and invalid star usage', () => {
  const file = writeJson('group-invalid.json', {
    users: [
      { id: 1, city: 'A', age: 20, orders: [{ total: 10 }] },
    ],
  });

  assertHasError(compileAndExecute('SELECT city, age, COUNT(*) FROM users GROUP BY city;', file), 'must appear in GROUP BY');
  assertHasError(compileAndExecute('SELECT city FROM users HAVING COUNT(*) > 0;', file), 'must appear in GROUP BY');
  assertHasError(compileAndExecute('SELECT SUM(*) FROM users;', file), "Aggregate function 'SUM' cannot use *");
  assertHasError(compileAndExecute('SELECT id FROM users WHERE COUNT(*) > 0;', file), 'Aggregate functions are not allowed in WHERE');
  assertHasError(compileAndExecute('SELECT id, ARRAY_SUM(orders.total) FROM users GROUP BY id;', file), 'must be wrapped in a group aggregate');
});

runTest('GROUP BY supports multiple keys and nested paths', () => {
  const file = writeJson('group-multiple-keys.json', {
    users: [
      { id: 1, address: { city: 'Warszawa' }, profile: { active: true }, age: 20 },
      { id: 2, address: { city: 'Warszawa' }, profile: { active: true }, age: 30 },
      { id: 3, address: { city: 'Warszawa' }, profile: { active: false }, age: 40 },
      { id: 4, address: { city: 'Krakow' }, profile: { active: true }, age: 50 },
    ],
  });

  const result = compileAndExecute('SELECT address.city, profile.active, COUNT(*), SUM(age) FROM users GROUP BY address.city, profile.active ORDER BY address.city ASC;', file);
  assertNoErrors(result);
  assert(result.result.length === 3, `Expected 3 grouped rows, got ${result.result.length}`);

  const warszawaActive = result.result.find(row => row['address.city'] === 'Warszawa' && row['profile.active'] === true);
  const warszawaInactive = result.result.find(row => row['address.city'] === 'Warszawa' && row['profile.active'] === false);
  const krakowActive = result.result.find(row => row['address.city'] === 'Krakow' && row['profile.active'] === true);
  assert(warszawaActive?.['COUNT(*)'] === 2, 'Expected Warszawa active users to be grouped together');
  assert(warszawaActive?.['SUM(age)'] === 50, 'Expected SUM(age) for Warszawa active group');
  assert(warszawaInactive?.['COUNT(*)'] === 1, 'Expected Warszawa inactive group');
  assert(krakowActive?.['SUM(age)'] === 50, 'Expected nested path grouping for Krakow');
});

runTest('Group aggregates work after JOIN', () => {
  const file = writeJson('join-group-aggregates.json', {
    users: [
      { id: 1, name: 'Ala' },
      { id: 2, name: 'Ola' },
      { id: 3, name: 'Ela' },
    ],
    orders: [
      { id: 10, userId: 1, total: 40 },
      { id: 11, userId: 1, total: 70 },
      { id: 12, userId: 2, total: 90 },
    ],
  });

  const result = compileAndExecute('SELECT u.name, COUNT(*), SUM(o.total) FROM users AS u JOIN orders AS o ON u.id = o.userId GROUP BY u.name HAVING SUM(o.total) > 100;', file);
  assertNoErrors(result);
  assert(result.result.length === 1, `Expected 1 grouped join row, got ${result.result.length}`);
  assert(result.result[0]['u.name'] === 'Ala', 'Expected HAVING to keep only Ala');
  assert(result.result[0]['COUNT(*)'] === 2, 'Expected joined row count per user');
  assert(result.result[0]['SUM(o.total)'] === 110, 'Expected SUM over joined rows');
});

runTest('Group aggregates work after UNNEST', () => {
  const file = writeJson('unnest-group-aggregates.json', {
    users: [
      { id: 1, tags: ['admin', 'dev'] },
      { id: 2, tags: ['admin', 'qa'] },
      { id: 3, tags: ['dev'] },
      { id: 4, tags: [] },
    ],
  });

  const result = compileAndExecute('SELECT tag, COUNT(*) FROM users UNNEST(tags) AS tag GROUP BY tag HAVING COUNT(*) > 1 ORDER BY tag;', file);
  assertNoErrors(result);
  assert(result.result.length === 2, `Expected 2 popular tags, got ${result.result.length}`);
  assert(result.result[0].tag === 'admin' && result.result[0]['COUNT(*)'] === 2, 'Expected admin tag count');
  assert(result.result[1].tag === 'dev' && result.result[1]['COUNT(*)'] === 2, 'Expected dev tag count');
});

runTest('ORDER BY and LIMIT apply after grouped projection', () => {
  const file = writeJson('group-order-limit.json', {
    users: [
      { id: 1, city: 'A', age: 10 },
      { id: 2, city: 'B', age: 20 },
      { id: 3, city: 'B', age: 30 },
      { id: 4, city: 'C', age: 40 },
    ],
  });

  const result = compileAndExecute('SELECT city, COUNT(*), SUM(age) FROM users GROUP BY city ORDER BY city DESC LIMIT 2;', file);
  assertNoErrors(result);
  assert(result.result.length === 2, `Expected LIMIT to keep 2 groups, got ${result.result.length}`);
  assert(result.result[0].city === 'C', 'Expected ORDER BY to run after grouped projection');
  assert(result.result[1].city === 'B', 'Expected descending city order before LIMIT');
  assert(result.result[1]['COUNT(*)'] === 2, 'Expected group aggregate value to survive ORDER BY/LIMIT');
});

runTest('COUNT field and numeric aggregates skip null and missing values', () => {
  const file = writeJson('aggregate-null-missing.json', {
    users: [
      { id: 1, score: 10 },
      { id: 2, score: null },
      { id: 3 },
      { id: 4, score: 30 },
    ],
  });

  const result = compileAndExecute('SELECT COUNT(*), COUNT(score), SUM(score), AVG(score), MIN(score), MAX(score) FROM users;', file);
  assertNoErrors(result);
  assert(result.result[0]['COUNT(*)'] === 4, 'Expected COUNT(*) to include every row');
  assert(result.result[0]['COUNT(score)'] === 2, 'Expected COUNT(score) to skip null and missing values');
  assert(result.result[0]['SUM(score)'] === 40, 'Expected SUM(score) to skip null and missing values');
  assert(result.result[0]['AVG(score)'] === 20, 'Expected AVG(score) to skip null and missing values');
  assert(result.result[0]['MIN(score)'] === 10, 'Expected MIN(score) to skip null and missing values');
  assert(result.result[0]['MAX(score)'] === 30, 'Expected MAX(score) to skip null and missing values');
});

runTest('Grouped query semantics reject invalid HAVING and GROUP BY expressions', () => {
  const file = writeJson('group-more-invalid.json', {
    users: [
      { id: 1, city: 'A', name: 'Ala', age: 20, orders: [{ total: 10 }] },
      { id: 2, city: 'A', name: 'Ola', age: 30, orders: [] },
    ],
  });

  assertHasError(compileAndExecute('SELECT city, COUNT(*) FROM users GROUP BY city HAVING age > 10;', file), 'must appear in GROUP BY');
  assertHasError(compileAndExecute("SELECT city, COUNT(*) FROM users GROUP BY city HAVING name = 'Ala';", file), 'must appear in GROUP BY');
  assertHasError(compileAndExecute('SELECT * FROM users GROUP BY city;', file), 'SELECT * cannot be used with GROUP BY');
  assertHasError(compileAndExecute('SELECT missing, COUNT(*) FROM users GROUP BY missing;', file), "Unknown path 'missing'");
  assertHasError(compileAndExecute('SELECT city, ARRAY_SUM(orders.total) FROM users HAVING COUNT(*) > 0;', file), 'must be wrapped in a group aggregate');
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

  const unqualifiedRight = compileAndExecute('SELECT name, role FROM users AS u JOIN people AS p ON u.id = p.id;', writeJson('join-unqualified-right.json', {
    users: [{ id: 1, name: 'Ala' }],
    people: [{ id: 1, role: 'admin' }],
  }));
  assertNoErrors(unqualifiedRight);
  assert(unqualifiedRight.result[0].role === 'admin', 'Expected unique right-side field to resolve unqualified');
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

  const naturalProjection = compileAndExecute('SELECT leftValue, rightValue FROM lefts NATURAL JOIN rights;', file);
  assertNoErrors(naturalProjection);
  assert(naturalProjection.result[0].rightValue === 'R1', 'Expected unique right-side NATURAL JOIN field to resolve unqualified');

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

runTest('SELECT path star expands direct object fields with prefixed keys', () => {
  const result = execute("SELECT name, address.* FROM users WHERE address.city LIKE 'War%' LIMIT 1;");
  assertNoErrors(result);
  assert(result.result.length === 1, `Expected 1 wildcard row, got ${result.result.length}`);
  assert(result.result[0].name === 'Alicja Kowalska', 'Expected normal selected field');
  assert(result.result[0]['address.city'] === 'Warszawa', 'Expected expanded city field');
  assert(result.result[0]['address.street'] === 'Marszałkowska 10', 'Expected expanded street field');
  assert(result.result[0]['address.zip'] === '00-001', 'Expected expanded zip field');

  const aliased = execute('SELECT u.address.* FROM users AS u LIMIT 1;');
  assertNoErrors(aliased);
  assert(aliased.result[0]['u.address.city'] === 'Warszawa', 'Expected alias-qualified wildcard prefix');

  const union = execute('SELECT address.* FROM users UNION SELECT address.* FROM users LIMIT 1;');
  assertNoErrors(union);
  assert(union.result[0]['address.city'] === 'Warszawa', 'Expected wildcard expansion inside set operations');
});

runTest('SELECT path star rejects known scalar paths and skips non-object runtime values', () => {
  assertHasError(execute('SELECT age.* FROM users LIMIT 1;'), "wildcard 'age.*' requires an object path");

  const file = writeJson('wildcard-mixed.json', {
    users: [
      { id: 1, meta: { city: 'A', zip: '1' } },
      { id: 2, meta: null },
      { id: 3, meta: 'not-object' },
    ],
  });

  const result = compileAndExecute('SELECT id, meta.* FROM users ORDER BY id;', file);
  assertNoErrors(result);
  assert(result.result[0]['meta.city'] === 'A', 'Expected object row to expand fields');
  assert(!Object.hasOwn(result.result[1], 'meta.city'), 'Expected null value to emit no wildcard fields');
  assert(!Object.hasOwn(result.result[2], 'meta.city'), 'Expected scalar runtime value to emit no wildcard fields');
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

runTest('Table formatting wraps complete nested values without ellipses', () => {
  const table = stripAnsi(formatTable([
    { id: 1, address: { city: 'Warszawa', street: 'Marszałkowska 10', zip: '00-001' } },
  ], ['id', 'address'], 36));

  assert(!table.includes('…'), 'Expected wrapped table to avoid unicode ellipsis');
  assert(!table.includes('...'), 'Expected wrapped table to avoid three-dot ellipsis');
  assert(table.includes('{"city":"'), 'Expected wrapped JSON object start to be visible');
  assert(table.includes('Warszawa'), 'Expected wrapped JSON object value to be visible');
  assert(table.includes('"zip"') && table.includes('00-0') && table.includes('01'), 'Expected wrapped JSON object ending value to be visible');
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
