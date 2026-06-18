import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname } from 'node:path';
import { CompilerError } from '../errors/errors.js';
import { normalizeDataset } from './dataset.js';

export function loadDatabase(filePath) {
  if (!filePath || extname(filePath).toLowerCase() !== '.json') {
    throw new CompilerError('runtime', `Failed to load database '${filePath}': expected a .json file`, null);
  }

  if (!existsSync(filePath)) {
    return {
      filePath,
      data: {},
      schema: { collections: {} },
      created: true,
      legacyArrayRoot: false,
    };
  }

  try {
    const stat = statSync(filePath);
    if (!stat.isFile()) {
      throw new Error('expected an existing .json file, not a directory');
    }

    const raw = readFileSync(filePath, 'utf-8');
    const parsed = raw.trim() ? JSON.parse(raw) : {};
    const normalized = normalizeDataset(parsed, filePath);

    return {
      filePath,
      data: normalized.data,
      schema: normalized.schema,
      created: false,
      legacyArrayRoot: Array.isArray(parsed),
    };
  } catch (error) {
    if (error?.phase) throw error;
    throw new CompilerError('runtime', `Failed to load database '${filePath}': ${error.message}`, null);
  }
}

export function refreshDatabaseSchema(session) {
  const normalized = normalizeDataset(session.data, session.filePath);
  session.data = normalized.data;
  session.schema = normalized.schema;
  return session;
}

export function saveDatabase(session, filePath = session.filePath) {
  if (!filePath || extname(filePath).toLowerCase() !== '.json') {
    throw new CompilerError('runtime', `Failed to save database '${filePath}': expected a .json file`, null);
  }

  try {
    mkdirSync(dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    writeFileSync(tempPath, `${JSON.stringify(session.data, null, 2)}\n`, 'utf-8');
    renameSync(tempPath, filePath);
    session.filePath = filePath;
    session.created = false;
    session.legacyArrayRoot = false;
    return session;
  } catch (error) {
    if (error?.phase) throw error;
    throw new CompilerError('runtime', `Failed to save database '${filePath}': ${error.message}`, null);
  }
}

export function cloneDatabaseData(data) {
  return JSON.parse(JSON.stringify(data));
}
