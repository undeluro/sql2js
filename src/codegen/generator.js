// ──────────────────────────────────────────────
// Code Generator — AST → JavaScript source code
// ──────────────────────────────────────────────

export default class CodeGenerator {

  /**
   * Generate JavaScript code from a QueryNode AST.
   * Returns { code: string, formattedCode: string }
   */
  generate(query) {
    const lines = [];
    const indent = (n) => '  '.repeat(n);

    lines.push('((data, joinData) => {');
    lines.push(`${indent(1)}let result = Array.isArray(data) ? [...data] : [data];`);

    // ── JOIN ──────────────────────────────────
    if (query.join) {
      const joinAlias = query.join.alias || query.join.source;
      const srcAlias = query.from.alias || query.from.name;
      const condCode = this._exprToJS(query.join.condition, null);
      lines.push('');
      lines.push(`${indent(1)}// JOIN`);
      lines.push(`${indent(1)}const __joinSrc = Array.isArray(joinData) ? joinData : [joinData];`);
      lines.push(`${indent(1)}result = result.flatMap(${srcAlias} => `);
      lines.push(`${indent(2)}__joinSrc.filter(${joinAlias} => ${condCode})`);
      lines.push(`${indent(3)}.map(${joinAlias} => ({ ...${srcAlias}, ...Object.fromEntries(Object.entries(${joinAlias}).map(([k,v]) => [\`${joinAlias}.\${k}\`, v])), __${srcAlias}: ${srcAlias}, __${joinAlias}: ${joinAlias} }))`);
      lines.push(`${indent(1)});`);
    }

    // ── UNNEST ────────────────────────────────
    for (const u of query.unnest) {
      const pathCode = this._pathToAccessor(u.path, 'row');
      lines.push('');
      lines.push(`${indent(1)}// UNNEST(${u.path}) AS ${u.alias}`);
      lines.push(`${indent(1)}result = result.flatMap(row => {`);
      lines.push(`${indent(2)}const arr = ${pathCode};`);
      lines.push(`${indent(2)}if (!Array.isArray(arr)) return [{ ...row, ${u.alias}: arr }];`);
      lines.push(`${indent(2)}return arr.map(${u.alias} => ({ ...row, ${u.alias} }));`);
      lines.push(`${indent(1)}});`);
    }

    // ── WHERE ─────────────────────────────────
    if (query.where) {
      const rowParam = this._getRowParam(query);
      const filterCode = this._exprToJS(query.where, rowParam);
      lines.push('');
      lines.push(`${indent(1)}// WHERE`);
      lines.push(`${indent(1)}result = result.filter(${rowParam} => ${filterCode});`);
    }

    // ── ORDER BY ──────────────────────────────
    if (query.orderBy.length > 0) {
      lines.push('');
      lines.push(`${indent(1)}// ORDER BY`);
      lines.push(`${indent(1)}result.sort((a, b) => {`);
      for (const item of query.orderBy) {
        const aPath = this._pathToAccessor(item.path, 'a');
        const bPath = this._pathToAccessor(item.path, 'b');
        const dir = item.direction === 'DESC' ? -1 : 1;
        lines.push(`${indent(2)}{`);
        lines.push(`${indent(3)}const _a = ${aPath}, _b = ${bPath};`);
        lines.push(`${indent(3)}if (_a > _b) return ${dir};`);
        lines.push(`${indent(3)}if (_a < _b) return ${-dir};`);
        lines.push(`${indent(2)}}`);
      }
      lines.push(`${indent(2)}return 0;`);
      lines.push(`${indent(1)}});`);
    }

    // ── LIMIT ─────────────────────────────────
    if (query.limit !== null && query.limit !== undefined) {
      lines.push('');
      lines.push(`${indent(1)}// LIMIT`);
      lines.push(`${indent(1)}result = result.slice(0, ${query.limit});`);
    }

    // ── SELECT (projection) ───────────────────
    const sel = query.select;
    if (sel.type !== 'SelectAll') {
      const items = Array.isArray(sel) ? sel : [sel];
      const rowParam = this._getRowParam(query);
      lines.push('');
      lines.push(`${indent(1)}// SELECT`);

      const projections = items.map(item => {
        const key = item.alias || this._exprToLabel(item.expr);
        const val = this._exprToJS(item.expr, rowParam);
        return `${indent(3)}${JSON.stringify(key)}: ${val}`;
      });

      lines.push(`${indent(1)}result = result.map(${rowParam} => ({`);
      lines.push(projections.join(',\n'));
      lines.push(`${indent(1)}}));`);
    }

    lines.push('');
    lines.push(`${indent(1)}return result;`);
    lines.push('})');

    const code = lines.join('\n');
    return { code, formattedCode: code };
  }

  // ── Expression → JS ────────────────────────

  _exprToJS(expr, rowVar) {
    if (!expr) return 'undefined';

    switch (expr.type) {
      case 'BinaryExpr':
        return this._binaryToJS(expr, rowVar);

      case 'UnaryExpr':
        if (expr.op === 'NOT') return `!(${this._exprToJS(expr.operand, rowVar)})`;
        if (expr.op === '-') return `-(${this._exprToJS(expr.operand, rowVar)})`;
        return `${expr.op}(${this._exprToJS(expr.operand, rowVar)})`;

      case 'Aggregate':
        return this._aggregateToJS(expr, rowVar);

      case 'Path':
        return this._pathToAccessor(expr, rowVar);

      case 'Literal':
        return this._literalToJS(expr);

      default:
        return `/* unknown: ${expr.type} */`;
    }
  }

  _binaryToJS(expr, rowVar) {
    const left = this._exprToJS(expr.left, rowVar);
    const right = this._exprToJS(expr.right, rowVar);

    const opMap = {
      'AND': '&&',
      'OR': '||',
      '=': '===',
      '!=': '!==',
      '<': '<',
      '>': '>',
      '<=': '<=',
      '>=': '>=',
      '+': '+',
      '-': '-',
      '*': '*',
      '/': '/',
    };

    const jsOp = opMap[expr.op] || expr.op;
    return `(${left} ${jsOp} ${right})`;
  }

  _aggregateToJS(expr, rowVar) {
    const arrPath = this._pathToAccessor(expr.path, rowVar);
    switch (expr.func) {
      case 'COUNT':
        return `(Array.isArray(${arrPath}) ? ${arrPath}.length : 0)`;
      case 'SUM':
        return `(Array.isArray(${arrPath}) ? ${arrPath}.reduce((s, v) => s + (typeof v === 'object' ? 0 : Number(v)), 0) : 0)`;
      case 'AVG':
        return `(Array.isArray(${arrPath}) && ${arrPath}.length ? ${arrPath}.reduce((s, v) => s + Number(v), 0) / ${arrPath}.length : 0)`;
      case 'MIN':
        return `(Array.isArray(${arrPath}) && ${arrPath}.length ? Math.min(...${arrPath}.map(Number)) : null)`;
      case 'MAX':
        return `(Array.isArray(${arrPath}) && ${arrPath}.length ? Math.max(...${arrPath}.map(Number)) : null)`;
      default:
        return `/* unknown aggregate ${expr.func} */`;
    }
  }

  _pathToAccessor(pathNode, rowVar) {
    if (!pathNode || !pathNode.segments) return 'undefined';

    const segments = pathNode.segments;
    // Use optional chaining for nested paths
    if (segments.length === 1) {
      return `${rowVar}${rowVar ? '.' : ''}${segments[0]}`;
    }
    // For multi-segment paths, try direct access first, then optional chaining
    return `${rowVar}?.${segments.join('?.')}`;
  }

  _literalToJS(expr) {
    if (expr.dataType === 'string') return JSON.stringify(expr.value);
    if (expr.dataType === 'null') return 'null';
    if (expr.dataType === 'boolean') return expr.value ? 'true' : 'false';
    return String(expr.value);
  }

  // ── Helpers ────────────────────────────────

  _getRowParam(query) {
    return 'row';
  }

  /**
   * Generate a human-readable label for a select expression
   * Used as the column name when no alias is given
   */
  _exprToLabel(expr) {
    if (!expr) return '?';
    switch (expr.type) {
      case 'Path':
        return expr.segments.join('.');
      case 'Aggregate':
        return `${expr.func}(${this._exprToLabel(expr.path)})`;
      case 'Literal':
        return String(expr.value);
      case 'BinaryExpr':
        return `${this._exprToLabel(expr.left)} ${expr.op} ${this._exprToLabel(expr.right)}`;
      default:
        return '?';
    }
  }
}
