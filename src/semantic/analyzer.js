// ──────────────────────────────────────────────
// Semantic Analyzer
// Validates an AST before code generation.
// Collects all errors (does not stop at first).
// ──────────────────────────────────────────────

import { CompilerError } from '../errors/errors.js';

export default class SemanticAnalyzer {
  constructor(schema = null) {
    this.schema = schema;
    this.errors = [];
    this.aliases = new Map();
    this.knownCollections = new Set();
  }

  analyzeProgram(program) {
    this.errors = [];
    const knownCollections = new Set(Object.keys(this.schema?.collections || {}));
    this.knownCollections = knownCollections;

    for (const statement of program.statements || program.queries || []) {
      this._analyzeStatement(statement, knownCollections);
      if (statement.type === 'CreateCollection') {
        knownCollections.add(statement.name);
      }
    }

    return { errors: this.errors };
  }

  analyze(statement) {
    this.errors = [];
    this.knownCollections = new Set(Object.keys(this.schema?.collections || {}));
    this._analyzeStatement(statement, this.knownCollections);
    return { errors: this.errors };
  }

  _analyzeStatement(statement, knownCollections) {
    this.aliases = new Map();

    switch (statement.type) {
      case 'Query':
        this._analyzeSelectStatement(statement, knownCollections);
        break;
      case 'SetOperation':
        this._analyzeSetOperation(statement, knownCollections);
        break;
      case 'CreateCollection':
        this._analyzeCreate(statement);
        break;
      case 'Insert':
        this._requireCollection(statement.collection, statement.loc, knownCollections, 'INSERT');
        this._analyzeExpr(statement.record);
        break;
      case 'Update':
        this._requireCollection(statement.collection, statement.loc, knownCollections, 'UPDATE');
        this.aliases.set(statement.collection, { kind: 'source', name: statement.collection });
        for (const assignment of statement.assignments) {
          this._analyzePath(assignment.path, { collection: statement.collection, requireKnown: Boolean(this.schema) });
          this._analyzeExpr(assignment.expr);
        }
        if (statement.where) this._analyzeExpr(statement.where);
        break;
      case 'Delete':
        this._requireCollection(statement.collection, statement.loc, knownCollections, 'DELETE');
        this.aliases.set(statement.collection, { kind: 'source', name: statement.collection });
        if (statement.where) this._analyzeExpr(statement.where);
        break;
      default:
        this._error(`Unknown statement type '${statement.type}'`, statement.loc);
    }
  }

  _analyzeSelectStatement(query, knownCollections) {
    this._analyzeSource(query, knownCollections);
    this._analyzeJoin(query, knownCollections);
    this._analyzeUnnest(query);
    this._analyzeSelect(query);
    this._analyzeWhere(query);
    this._analyzeOrderBy(query);
    this._analyzeLimit(query);
  }

  _analyzeSetOperation(statement, knownCollections) {
    this._analyzeIndependentSelect(statement.base, knownCollections);
    for (const operation of statement.operations) {
      this._analyzeIndependentSelect(operation.query, knownCollections);
    }
    this._analyzeFinalOrderBy(statement.orderBy || []);
    this._analyzeLimit(statement);
  }

  _analyzeIndependentSelect(query, knownCollections) {
    this.aliases = new Map();
    this._analyzeSelectStatement(query, knownCollections);
  }

  _analyzeCreate(statement) {
    if (statement.records.type !== 'ArrayLiteral') {
      this._error('CREATE COLLECTION requires an array literal', statement.loc);
      return;
    }

    if (statement.records.items.length === 0) {
      this._error('CREATE COLLECTION requires at least one object literal', statement.loc);
    }

    for (const item of statement.records.items) {
      if (item.type !== 'ObjectLiteral') {
        this._error('CREATE COLLECTION array may contain only object literals', item.loc);
      }
    }
  }

  // ── Source ──────────────────────────────────

  _analyzeSource(query, knownCollections) {
    const src = query.from;
    if (!src || !src.name) {
      this._error('Missing FROM source', src?.loc);
      return;
    }

    this._requireCollection(src.name, src.loc, knownCollections, 'SELECT');
    const key = src.alias || src.name;
    this.aliases.set(key, { kind: 'source', name: src.name });
  }

  // ── JOIN ───────────────────────────────────

  _analyzeJoin(query, knownCollections) {
    if (!query.join) return;
    const j = query.join;

    if (!j.source) {
      this._error('JOIN source is missing', j.loc);
      return;
    }

    this._requireCollection(j.source, j.loc, knownCollections, 'JOIN');
    const key = j.alias || j.source;
    if (this.aliases.has(key)) {
      this._error(`Duplicate alias '${key}'`, j.loc);
    }
    this.aliases.set(key, { kind: 'join', name: j.source });

    if (j.natural) {
      if (j.condition) {
        this._error('NATURAL JOIN cannot use an ON condition', j.loc);
      }
      const commonFields = this._getCommonTopLevelFields(query.from.name, j.source);
      if (commonFields) {
        if (commonFields.length === 0) {
          this._error(`NATURAL JOIN between '${query.from.name}' and '${j.source}' has no common top-level fields`, j.loc);
        } else {
          j.commonFields = commonFields;
        }
      }
      return;
    }

    if (!j.condition) {
      this._error('JOIN requires ON condition', j.loc);
    } else {
      this._analyzeExpr(j.condition);
    }
  }

  // ── UNNEST ─────────────────────────────────

  _analyzeUnnest(query) {
    for (const u of query.unnest) {
      if (!u.alias) {
        this._error('UNNEST requires an alias (AS name)', u.loc);
        continue;
      }
      if (this.aliases.has(u.alias)) {
        this._error(`Duplicate alias '${u.alias}'`, u.loc);
      }
      const pathSchema = this._analyzePath(u.path, { requireKnown: Boolean(this.schema) });
      if (pathSchema && pathSchema.kind !== 'array') {
        this._error(`UNNEST requires an array path, got '${u.path.toString()}'`, u.loc);
      }
      this.aliases.set(u.alias, { kind: 'unnest', path: u.path });
    }
  }

  // ── SELECT ─────────────────────────────────

  _analyzeSelect(query) {
    const sel = query.select;
    if (sel.type === 'SelectAll') return;
    if (Array.isArray(sel)) {
      if (sel.length === 0) {
        this._error('SELECT list is empty', query.loc);
      }
      for (const item of sel) {
        this._analyzeExpr(item.expr);
      }
    }
  }

  // ── WHERE ──────────────────────────────────

  _analyzeWhere(query) {
    if (query.where) this._analyzeExpr(query.where);
  }

  // ── ORDER BY ───────────────────────────────

  _analyzeOrderBy(query) {
    for (const item of query.orderBy) {
      if (!item.path || !item.path.segments || item.path.segments.length === 0) {
        this._error('ORDER BY item has no path', item.loc);
      } else {
        this._analyzePath(item.path, { requireKnown: Boolean(this.schema) });
      }
      const dir = item.direction?.toUpperCase();
      if (dir && dir !== 'ASC' && dir !== 'DESC') {
        this._error(`Invalid order direction '${item.direction}'`, item.loc);
      }
    }
  }

  _analyzeFinalOrderBy(orderBy) {
    for (const item of orderBy) {
      if (!item.path || !item.path.segments || item.path.segments.length === 0) {
        this._error('ORDER BY item has no path', item.loc);
      }
      const dir = item.direction?.toUpperCase();
      if (dir && dir !== 'ASC' && dir !== 'DESC') {
        this._error(`Invalid order direction '${item.direction}'`, item.loc);
      }
    }
  }

  // ── LIMIT ──────────────────────────────────

  _analyzeLimit(query) {
    if (query.limit !== null && query.limit !== undefined) {
      if (!Number.isInteger(query.limit) || query.limit < 0) {
        this._error(`LIMIT must be a non-negative integer, got '${query.limit}'`, query.loc);
      }
    }
  }

  // ── Expression validation (recursive) ──────

  _analyzeExpr(expr) {
    if (!expr) return null;

    switch (expr.type) {
      case 'BinaryExpr':
        this._analyzeExpr(expr.left);
        this._analyzeExpr(expr.right);
        return null;

      case 'UnaryExpr':
        this._analyzeExpr(expr.operand);
        return null;

      case 'Aggregate': {
        if (!['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'].includes(expr.func)) {
          this._error(`Unknown aggregate function '${expr.func}'`, expr.loc);
        }
        if (!expr.path || expr.path.type !== 'Path') {
          this._error('Aggregate function requires a path argument', expr.loc);
          return null;
        }
        const schema = this._analyzeAggregatePath(expr.path, Boolean(this.schema));
        if (schema?.arraySchema && schema.arraySchema.kind !== 'array') {
          this._error(`Aggregate function '${expr.func}' requires an array path`, expr.loc);
        }
        return schema?.arraySchema || null;
      }

      case 'Path':
        return this._analyzePath(expr, { requireKnown: Boolean(this.schema) });

      case 'Literal':
        return null;

      case 'ObjectLiteral':
        for (const value of Object.values(expr.properties)) {
          this._analyzeExpr(value);
        }
        return null;

      case 'ArrayLiteral':
        for (const item of expr.items) {
          this._analyzeExpr(item);
        }
        return null;

      default:
        return null;
    }
  }

  _analyzePath(path, { collection = null, requireKnown = false } = {}) {
    if (!path.segments || path.segments.length === 0) {
      this._error('Empty path', path.loc);
      return null;
    }

    if (!this.schema) return null;

    const resolved = this._resolvePathRoot(path, collection);
    if (resolved.dynamic) return null;
    if (resolved.collection) {
      return this._lookupPathSchema(resolved.collection, resolved.segments, path, requireKnown);
    }

    const sourceAlias = [...this.aliases.values()].find(alias => alias.kind === 'source');
    const sourceSchema = sourceAlias
      ? this._lookupPathSchema(sourceAlias.name, path.segments, path, false)
      : null;
    if (sourceSchema) return sourceSchema;

    const joinMatches = [...this.aliases.values()]
      .filter(alias => alias.kind === 'join')
      .map(alias => this._lookupPathSchema(alias.name, path.segments, path, false))
      .filter(Boolean);

    if (joinMatches.length === 1) return joinMatches[0];

    const hasKnownCollectionWithoutSchema = [sourceAlias, ...[...this.aliases.values()].filter(alias => alias.kind === 'join')]
      .filter(Boolean)
      .some(alias => this.knownCollections.has(alias.name) && !this.schema.collections?.[alias.name]);

    if (hasKnownCollectionWithoutSchema) return null;

    if (requireKnown) {
      this._error(`Unknown path '${path.toString()}'`, path.loc);
    }

    return null;
  }

  _analyzeAggregatePath(path, requireKnown = false) {
    if (!this.schema) return null;

    const [first, second, ...tailAfterAlias] = path.segments;
    const isAliasQualified = this.aliases.has(first) && second;
    const rootSegments = isAliasQualified ? [first, second] : [first];
    const valueSegments = isAliasQualified ? tailAfterAlias : path.segments.slice(1);
    const rootPath = { ...path, segments: rootSegments, toString: () => rootSegments.join('.') };
    const arraySchema = this._analyzePath(rootPath, { requireKnown });

    if (!arraySchema || arraySchema.kind !== 'array') {
      return { arraySchema };
    }

    if (valueSegments.length > 0) {
      this._lookupNestedSchema(arraySchema.element, valueSegments, path, requireKnown);
    }

    return { arraySchema };
  }

  _lookupPathSchema(collection, segments, path, requireKnown) {
    let current = this.schema.collections[collection];
    if (!current) {
      if (requireKnown && !this.knownCollections.has(collection)) {
        this._error(`Unknown collection '${collection}'`, path.loc);
      }
      return null;
    }

    return this._lookupNestedSchema(current, segments, path, requireKnown);
  }

  _lookupNestedSchema(schema, segments, path, requireKnown) {
    let current = schema;

    if (current.kind === 'unknown' || current.kind === 'mixed') {
      return null;
    }

    for (const segment of segments) {
      if (current.kind === 'collection' || current.kind === 'object') {
        current = current.fields?.[segment];
      } else if (current.kind === 'array') {
        current = current.element?.fields?.[segment];
      } else {
        current = null;
      }

      if (!current) {
        if (requireKnown) this._error(`Unknown path '${path.toString()}'`, path.loc);
        return null;
      }

      if (current.kind === 'unknown' || current.kind === 'mixed') {
        return null;
      }
    }

    return current;
  }

  _resolvePathRoot(path, fallbackCollection = null) {
    const [first, ...rest] = path.segments;

    if (this.aliases.has(first)) {
      const alias = this.aliases.get(first);
      if (!alias.name) {
        return { collection: null, segments: rest, dynamic: true };
      }
      return {
        collection: alias.name,
        segments: rest,
      };
    }

    if (fallbackCollection) {
      return { collection: fallbackCollection, segments: path.segments };
    }

    return { collection: null, segments: path.segments };
  }

  _requireCollection(name, loc, knownCollections, operation) {
    if (!this.schema) return;
    if (!knownCollections.has(name)) {
      this._error(`${operation} references unknown collection '${name}'`, loc);
    }
  }

  _getCommonTopLevelFields(leftCollection, rightCollection) {
    if (!this.schema) return null;
    const leftFields = this.schema.collections?.[leftCollection]?.fields;
    const rightFields = this.schema.collections?.[rightCollection]?.fields;
    if (!leftFields || !rightFields) return null;
    return Object.keys(leftFields).filter(field => Object.hasOwn(rightFields, field));
  }

  // ── Error helper ───────────────────────────

  _error(message, loc) {
    this.errors.push(new CompilerError('semantic', message, loc || null));
  }
}
