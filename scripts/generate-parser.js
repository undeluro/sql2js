#!/usr/bin/env node

import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { get } from 'node:https';
import { resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const grammarDir = resolve(rootDir, 'grammar');
const generatedDir = resolve(rootDir, 'src', 'generated');
const cacheDir = resolve(rootDir, '.antlr');
const jarName = 'antlr-4.13.1-complete.jar';
const jarUrl = `https://www.antlr.org/download/${jarName}`;

function findJar() {
  const candidates = [
    process.env.ANTLR_JAR,
    resolve(cacheDir, jarName),
    'C:\\tmp\\antlr-4.13.1-complete.jar',
    '/tmp/antlr-4.13.1-complete.jar',
  ].filter(Boolean);

  return candidates.find((path) => existsSync(path));
}

function downloadJar(targetPath) {
  mkdirSync(dirname(targetPath), { recursive: true });

  return new Promise((resolveDownload, reject) => {
    const file = createWriteStream(targetPath);
    get(jarUrl, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ANTLR jar: HTTP ${response.statusCode}`));
        return;
      }

      response.pipe(file);
      file.on('finish', () => file.close(resolveDownload));
    }).on('error', reject);
  });
}

function ensureGeneratedDir() {
  mkdirSync(generatedDir, { recursive: true });
}

let jarPath = findJar();

if (!jarPath) {
  jarPath = resolve(cacheDir, jarName);
  console.log(`Downloading ANTLR ${jarName}...`);
  await downloadJar(jarPath);
}

ensureGeneratedDir();

const result = spawnSync(
  'java',
  [
    '-jar',
    jarPath,
    '-Dlanguage=JavaScript',
    '-visitor',
    '-no-listener',
    'JsonQuery.g4',
    '-o',
    '../src/generated',
  ],
  {
    cwd: grammarDir,
    stdio: 'inherit',
  }
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log('Generated ANTLR parser in src/generated');
