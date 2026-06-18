import { basename, extname } from 'node:path';
import { CompilerError } from '../errors/errors.js';

export function collectionNameFromPath(filePath) {
  const file = basename(filePath || 'data.json');
  return file.slice(0, file.length - extname(file).length) || 'data';
}

export function normalizeDataset(value, filePath = null) {
  if (Array.isArray(value)) {
    if (!isCollectionArray(value)) {
      throw new CompilerError('runtime', 'Unsupported JSON dataset: root array must contain objects only', null);
    }
    const name = collectionNameFromPath(filePath);
    return buildDataset({ [name]: value });
  }

  if (isPlainObject(value)) {
    const collections = {};
    for (const [key, candidate] of Object.entries(value)) {
      if (!Array.isArray(candidate)) {
        throw new CompilerError(
          'runtime',
          `Unsupported JSON database: collection '${key}' must be an array of objects`,
          null
        );
      }
      if (!isCollectionArray(candidate)) {
        throw new CompilerError(
          'runtime',
          `Unsupported JSON database: collection '${key}' must contain objects only`,
          null
        );
      }
      collections[key] = candidate;
    }

    return buildDataset(collections);
  }

  throw new CompilerError('runtime', 'Unsupported JSON dataset: root must be an object or array of objects', null);
}

export function mergeSchemas(primarySchema, joinSchema = null) {
  return {
    collections: {
      ...(primarySchema?.collections || {}),
      ...(joinSchema?.collections || {}),
    },
  };
}

function buildDataset(collections) {
  const data = {};
  const schema = { collections: {} };

  for (const [name, records] of Object.entries(collections)) {
    data[name] = records.map(record => structuredCloneSafe(record));
    schema.collections[name] = inferCollectionSchema(records);
  }

  return { data, schema };
}

function isCollectionArray(value) {
  return Array.isArray(value) && value.every(isPlainObject);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function inferCollectionSchema(records) {
  const fieldNames = new Set();
  for (const record of records) {
    for (const key of Object.keys(record)) {
      fieldNames.add(key);
    }
  }

  const fields = {};
  for (const field of fieldNames) {
    const values = records.map(record => Object.hasOwn(record, field) ? record[field] : null);
    fields[field] = inferValueSchema(values);
  }

  return { kind: 'collection', fields };
}

function inferValueSchema(values) {
  const nullable = values.some(value => value === null || value === undefined);
  const concrete = values.filter(value => value !== null && value !== undefined);

  if (concrete.length === 0) {
    return { kind: 'scalar', dataType: 'null', nullable: true };
  }

  const inferred = concrete.map(inferSingleValueSchema);
  const first = inferred[0];
  const sameKind = inferred.every(schema => schema.kind === first.kind);

  if (!sameKind) {
    return { kind: 'mixed', nullable };
  }

  if (first.kind === 'object') {
    return mergeObjectSchemas(inferred, nullable);
  }

  if (first.kind === 'array') {
    return mergeArraySchemas(inferred, nullable);
  }

  const dataTypes = new Set(inferred.map(schema => schema.dataType));
  return {
    kind: 'scalar',
    dataType: dataTypes.size === 1 ? first.dataType : 'mixed',
    nullable,
  };
}

function inferSingleValueSchema(value) {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return { kind: 'array', element: { kind: 'unknown' }, nullable: false };
    }
    return {
      kind: 'array',
      element: inferValueSchema(value),
      nullable: false,
    };
  }

  if (isPlainObject(value)) {
    const fields = {};
    for (const [key, fieldValue] of Object.entries(value)) {
      fields[key] = inferValueSchema([fieldValue]);
    }
    return { kind: 'object', fields, nullable: false };
  }

  return {
    kind: 'scalar',
    dataType: value === null ? 'null' : typeof value,
    nullable: value === null,
  };
}

function mergeObjectSchemas(schemas, nullable) {
  const fieldNames = new Set();
  for (const schema of schemas) {
    for (const key of Object.keys(schema.fields)) {
      fieldNames.add(key);
    }
  }

  const fields = {};
  for (const field of fieldNames) {
    const fieldSchemas = schemas
      .map(schema => schema.fields[field] || { kind: 'scalar', dataType: 'null', nullable: true });
    fields[field] = mergeValueSchemas(fieldSchemas);
  }

  return { kind: 'object', fields, nullable };
}

function mergeArraySchemas(schemas, nullable) {
  return {
    kind: 'array',
    element: mergeValueSchemas(schemas.map(schema => schema.element)),
    nullable,
  };
}

function mergeValueSchemas(schemas) {
  if (schemas.length === 0) return { kind: 'unknown' };

  const knownSchemas = schemas.filter(schema => schema.kind !== 'unknown');
  if (knownSchemas.length > 0 && knownSchemas.length < schemas.length) {
    return mergeValueSchemas(knownSchemas);
  }

  const first = schemas[0];
  if (!schemas.every(schema => schema.kind === first.kind)) {
    return { kind: 'mixed', nullable: schemas.some(schema => schema.nullable) };
  }

  if (first.kind === 'object') {
    return mergeObjectSchemas(schemas, schemas.some(schema => schema.nullable));
  }

  if (first.kind === 'array') {
    return mergeArraySchemas(schemas, schemas.some(schema => schema.nullable));
  }

  if (first.kind === 'scalar') {
    const dataTypes = new Set(schemas.map(schema => schema.dataType));
    return {
      kind: 'scalar',
      dataType: dataTypes.size === 1 ? first.dataType : 'mixed',
      nullable: schemas.some(schema => schema.nullable),
    };
  }

  return first;
}
