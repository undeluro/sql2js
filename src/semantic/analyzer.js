// ──────────────────────────────────────────────
// Semantic Analyzer
// Validates an AST before code generation.
// Collects all errors (does not stop at first).
// ──────────────────────────────────────────────

import { CompilerError } from '../errors/errors.js';

export default class SemanticAnalyzer {
  constructor() {
    this.errors = [];
    this.aliases = new Map();  // alias → type info
  }

  /**
   * Analyze a QueryNode. Returns { errors: CompilerError[] }
   */
  analyze(query) {
    this.errors = [];
    this.aliases = new Map();

    this._analyzeSource(query);
    this._analyzeJoin(query);
    this._analyzeUnnest(query);
    this._analyzeSelect(query);
    this._analyzeWhere(query);
    this._analyzeOrderBy(query);
    this._analyzeLimit(query);

    return { errors: this.errors };
  }

  // ── Source ──────────────────────────────────

  _analyzeSource(query) {
    const src = query.from;
    if (!src || !src.name) {
      this._error('Missing FROM source', src?.loc);
    }
    // Register the source (and its alias)
    const key = src.alias || src.name;
    this.aliases.set(key, { kind: 'source', name: src.name });
  }

  // ── JOIN ───────────────────────────────────

  _analyzeJoin(query) {
    if (!query.join) return;
    const j = query.join;

    if (!j.source) {
      this._error('JOIN source is missing', j.loc);
      return;
    }

    const key = j.alias || j.source;
    if (this.aliases.has(key)) {
      this._error(`Duplicate alias '${key}'`, j.loc);
    }
    this.aliases.set(key, { kind: 'join', name: j.source });

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
      this.aliases.set(u.alias, { kind: 'unnest', path: u.path });
    }
  }

  // ── SELECT ─────────────────────────────────

  _analyzeSelect(query) {
    const sel = query.select;
    // SelectAll — nothing to validate
    if (sel.type === 'SelectAll') return;
    // Array of SelectItemNode
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
    if (query.where) {
      this._analyzeExpr(query.where);
    }
  }

  // ── ORDER BY ───────────────────────────────

  _analyzeOrderBy(query) {
    for (const item of query.orderBy) {
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
    if (!expr) return;

    switch (expr.type) {
      case 'BinaryExpr':
        this._analyzeExpr(expr.left);
        this._analyzeExpr(expr.right);
        // Type check: logical operators require boolean operands
        if (expr.op === 'AND' || expr.op === 'OR') {
          // We can't fully type-check at static analysis without runtime data,
          // but we can warn about obviously wrong constructs
        }
        break;

      case 'UnaryExpr':
        this._analyzeExpr(expr.operand);
        if (expr.op === 'NOT') {
          // Operand should be boolean-ish — can't fully check statically
        }
        break;

      case 'Aggregate':
        if (!['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'].includes(expr.func)) {
          this._error(`Unknown aggregate function '${expr.func}'`, expr.loc);
        }
        if (!expr.path || expr.path.type !== 'Path') {
          this._error('Aggregate function requires a path argument', expr.loc);
        }
        break;

      case 'Path':
        // Paths are valid if they have at least one segment
        if (!expr.segments || expr.segments.length === 0) {
          this._error('Empty path', expr.loc);
        }
        break;

      case 'Literal':
        // Literals are always valid
        break;

      default:
        // Unknown node type — shouldn't happen
        break;
    }
  }

  // ── Error helper ───────────────────────────

  _error(message, loc) {
    this.errors.push(new CompilerError('semantic', message, loc || null));
  }
}
