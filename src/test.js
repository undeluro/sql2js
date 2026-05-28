// Quick test script — verify the pipeline works

import { compile, compileAndExecute } from './pipeline.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(__dirname, '..', 'data');

function test(name, query, dataFile = 'users.json') {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  TEST: ${name}`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`  Query: ${query.trim()}`);

  const compiled = compile(query);

  if (compiled.errors.length > 0) {
    console.log('\n  ❌ Errors:');
    for (const e of compiled.errors) {
      console.log(`     ${e}`);
    }
    return false;
  }

  console.log(`\n  Pipeline: ${compiled.stages.map(s => `${s.status === 'ok' ? '✅' : '❌'} ${s.name}`).join(' → ')}`);
  console.log(`\n  Generated JS:`);
  console.log(compiled.code.split('\n').map(l => `    ${l}`).join('\n'));

  // Execute
  const result = compileAndExecute(query, resolve(dataDir, dataFile));
  if (result.runtimeError) {
    console.log(`\n  ❌ Runtime error: ${result.runtimeError.message}`);
    return false;
  }

  console.log(`\n  Result (${result.result?.length || 0} rows):`);
  console.log(JSON.stringify(result.result, null, 2).split('\n').map(l => `    ${l}`).join('\n'));

  return true;
}

// ── Run tests ──

let passed = 0;
let total = 0;

total++; if (test(
  'Simple filter with nested path',
  'SELECT name, address.city FROM users WHERE age > 18;'
)) passed++;

total++; if (test(
  'Order by with limit',
  'SELECT name, age FROM users ORDER BY age DESC LIMIT 3;'
)) passed++;

total++; if (test(
  'UNNEST tags',
  'SELECT name, tag FROM users UNNEST(tags) AS tag WHERE tag = \'admin\';'
)) passed++;

total++; if (test(
  'Aggregates',
  'SELECT name, COUNT(orders) FROM users WHERE COUNT(orders) > 2;'
)) passed++;

total++; if (test(
  'Complex filter',
  'SELECT id, profile.bio FROM users WHERE age >= 21 AND profile.active = true ORDER BY profile.score DESC LIMIT 5;'
)) passed++;

total++; if (test(
  'Select all',
  'SELECT * FROM users WHERE age < 25;'
)) passed++;

console.log(`\n${'═'.repeat(60)}`);
console.log(`  Results: ${passed}/${total} tests passed`);
console.log(`${'═'.repeat(60)}\n`);
