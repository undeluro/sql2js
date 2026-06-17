// ──────────────────────────────────────────────
// Code Generator — AST → JavaScript source code
// ──────────────────────────────────────────────

export default class CodeGenerator {

  /**
   * Generate JavaScript code from a ProgramNode or a single statement AST.
   * Returns { code: string, formattedCode: string }
   */
  generate(node) {
    const program = node.type === 'Program' ? node : { type: 'Program', statements: [node] };
    const lines = [];
    const indent = (n) => '  '.repeat(n);
    this._tempId = 0;

    lines.push('((data, joinData) => {');
    lines.push(`${indent(1)}let __lastResult = data;`);
    lines.push(`${indent(1)}let __mutated = false;`);
    lines.push(`${indent(1)}const __mutations = [];`);
    lines.push(`${indent(1)}const __getCollection = (name) => {`);
    lines.push(`${indent(2)}if (data && Array.isArray(data[name])) return data[name];`);
    lines.push(`${indent(2)}if (joinData && Array.isArray(joinData[name])) return joinData[name];`);
    lines.push(`${indent(2)}return [];`);
    lines.push(`${indent(1)}};`);
    lines.push(`${indent(1)}const __setPath = (target, path, value) => {`);
    lines.push(`${indent(2)}let obj = target;`);
    lines.push(`${indent(2)}for (let i = 0; i < path.length - 1; i++) {`);
    lines.push(`${indent(3)}const key = path[i];`);
    lines.push(`${indent(3)}if (obj[key] === null || typeof obj[key] !== 'object' || Array.isArray(obj[key])) obj[key] = {};`);
    lines.push(`${indent(3)}obj = obj[key];`);
    lines.push(`${indent(2)}}`);
    lines.push(`${indent(2)}obj[path[path.length - 1]] = value;`);
    lines.push(`${indent(1)}};`);
    lines.push(`${indent(1)}const __defineAlias = (target, alias, value) => {`);
    lines.push(`${indent(2)}Object.defineProperty(target, \`__\${alias}\`, { value, enumerable: false, configurable: true });`);
    lines.push(`${indent(2)}return target;`);
    lines.push(`${indent(1)}};`);
    lines.push(`${indent(1)}const __copyAliases = (target, ...sources) => {`);
    lines.push(`${indent(2)}for (const source of sources) {`);
    lines.push(`${indent(3)}if (!source || typeof source !== 'object') continue;`);
    lines.push(`${indent(3)}for (const key of Object.getOwnPropertyNames(source)) {`);
    lines.push(`${indent(4)}if (!key.startsWith('__')) continue;`);
    lines.push(`${indent(4)}Object.defineProperty(target, key, { value: source[key], enumerable: false, configurable: true });`);
    lines.push(`${indent(3)}}`);
    lines.push(`${indent(2)}}`);
    lines.push(`${indent(2)}return target;`);
    lines.push(`${indent(1)}};`);
    lines.push(`${indent(1)}const __mergeJoinRows = (left, right, leftAlias, rightAlias) => {`);
    lines.push(`${indent(2)}const out = {};`);
    lines.push(`${indent(2)}if (left && typeof left === 'object') Object.assign(out, left);`);
    lines.push(`${indent(2)}if (right && typeof right === 'object') {`);
    lines.push(`${indent(3)}for (const [key, value] of Object.entries(right)) {`);
    lines.push(`${indent(4)}if (Object.hasOwn(out, key)) out[\`\${rightAlias}.\${key}\`] = value;`);
    lines.push(`${indent(4)}else out[key] = value;`);
    lines.push(`${indent(3)}}`);
    lines.push(`${indent(2)}}`);
    lines.push(`${indent(2)}__copyAliases(out, left, right);`);
    lines.push(`${indent(2)}__defineAlias(out, leftAlias, left ?? null);`);
    lines.push(`${indent(2)}__defineAlias(out, rightAlias, right ?? null);`);
    lines.push(`${indent(2)}return out;`);
    lines.push(`${indent(1)}};`);
    lines.push(`${indent(1)}const __stableKey = (value) => JSON.stringify(value, (_key, candidate) => {`);
    lines.push(`${indent(2)}if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return candidate;`);
    lines.push(`${indent(2)}return Object.fromEntries(Object.keys(candidate).sort().map(key => [key, candidate[key]]));`);
    lines.push(`${indent(1)}});`);
    lines.push(`${indent(1)}const __distinctRows = (rows) => [...new Map(rows.map(row => [__stableKey(row), row])).values()];`);
    lines.push(`${indent(1)}const __setUnion = (left, right) => __distinctRows([...left, ...right]);`);
    lines.push(`${indent(1)}const __setIntersect = (left, right) => {`);
    lines.push(`${indent(2)}const rightKeys = new Set(right.map(__stableKey));`);
    lines.push(`${indent(2)}return __distinctRows(left).filter(row => rightKeys.has(__stableKey(row)));`);
    lines.push(`${indent(1)}};`);
    lines.push(`${indent(1)}const __setExcept = (left, right) => {`);
    lines.push(`${indent(2)}const rightKeys = new Set(right.map(__stableKey));`);
    lines.push(`${indent(2)}return __distinctRows(left).filter(row => !rightKeys.has(__stableKey(row)));`);
    lines.push(`${indent(1)}};`);
    lines.push(`${indent(1)}const __regexSpecials = new Set(['.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\\\']);`);
    lines.push(`${indent(1)}const __escapeRegex = (char) => __regexSpecials.has(char) ? '\\\\' + char : char;`);
    lines.push(`${indent(1)}const __like = (value, pattern, insensitive = false) => {`);
    lines.push(`${indent(2)}if (value === null || value === undefined || pattern === null || pattern === undefined) return false;`);
    lines.push(`${indent(2)}const source = String(pattern);`);
    lines.push(`${indent(2)}let regex = '^';`);
    lines.push(`${indent(2)}for (let i = 0; i < source.length; i++) {`);
    lines.push(`${indent(3)}const char = source[i];`);
    lines.push(`${indent(3)}if (char === '\\\\' && i + 1 < source.length) { regex += __escapeRegex(source[++i]); continue; }`);
    lines.push(`${indent(3)}if (char === '%') regex += '.*';`);
    lines.push(`${indent(3)}else if (char === '_') regex += '.';`);
    lines.push(`${indent(3)}else regex += __escapeRegex(char);`);
    lines.push(`${indent(2)}}`);
    lines.push(`${indent(2)}regex += '$';`);
    lines.push(`${indent(2)}return new RegExp(regex, insensitive ? 'i' : '').test(String(value));`);
    lines.push(`${indent(1)}};`);

    for (const statement of program.statements || program.queries || []) {
      this._statementToJS(statement, lines, indent);
    }

    lines.push('');
    lines.push(`${indent(1)}return { result: __lastResult, dataset: data, mutated: __mutated, mutations: __mutations };`);
    lines.push('})');

    const code = lines.join('\n');
    return { code, formattedCode: code };
  }

  _statementToJS(statement, lines, indent) {
    switch (statement.type) {
      case 'Query':
        this._selectToJS(statement, lines, indent);
        break;
      case 'SetOperation':
        this._setOperationToJS(statement, lines, indent);
        break;
      case 'CreateCollection':
        lines.push('');
        lines.push(`${indent(1)}// CREATE COLLECTION ${statement.name}`);
        lines.push(`${indent(1)}data[${JSON.stringify(statement.name)}] = ${this._exprToJS(statement.records, { rowVar: 'row' })};`);
        lines.push(`${indent(1)}__mutated = true;`);
        lines.push(`${indent(1)}__mutations.push({ type: 'create', collection: ${JSON.stringify(statement.name)}, count: data[${JSON.stringify(statement.name)}].length });`);
        lines.push(`${indent(1)}__lastResult = data;`);
        break;
      case 'Insert':
        lines.push('');
        lines.push(`${indent(1)}// INSERT INTO ${statement.collection}`);
        lines.push(`${indent(1)}if (!Array.isArray(data[${JSON.stringify(statement.collection)}])) data[${JSON.stringify(statement.collection)}] = [];`);
        lines.push(`${indent(1)}data[${JSON.stringify(statement.collection)}].push(${this._exprToJS(statement.record, { rowVar: 'row' })});`);
        lines.push(`${indent(1)}__mutated = true;`);
        lines.push(`${indent(1)}__mutations.push({ type: 'insert', collection: ${JSON.stringify(statement.collection)}, count: 1 });`);
        lines.push(`${indent(1)}__lastResult = data;`);
        break;
      case 'Update':
        this._updateToJS(statement, lines, indent);
        break;
      case 'Delete':
        this._deleteToJS(statement, lines, indent);
        break;
      default:
        lines.push(`${indent(1)}// Unknown statement: ${statement.type}`);
    }
  }

  _selectToJS(query, lines, indent) {
    const resultVar = `__result${this._nextTemp()}`;
    lines.push('');
    lines.push(`${indent(1)}// SELECT FROM ${query.from.name}`);
    this._emitSelectCore(query, lines, indent, resultVar);
    lines.push(`${indent(1)}__lastResult = ${resultVar};`);
  }

  _setOperationToJS(statement, lines, indent) {
    const suffix = this._nextTemp();
    const resultVar = `__setResult${suffix}`;
    lines.push('');
    lines.push(`${indent(1)}// SET OPERATION`);
    this._emitSelectCore(statement.base, lines, indent, resultVar);

    statement.operations.forEach((operation, index) => {
      const operandVar = `__setOperand${suffix}_${index}`;
      this._emitSelectCore(operation.query, lines, indent, operandVar);
      const helper = operation.op === 'INTERSECT'
        ? '__setIntersect'
        : operation.op === 'EXCEPT'
          ? '__setExcept'
          : '__setUnion';
      lines.push(`${indent(1)}${resultVar} = ${helper}(${resultVar}, ${operandVar});`);
    });

    this._orderAndLimitToJS(statement, lines, indent, resultVar, { rowVar: 'row', aliases: new Map() });
    lines.push(`${indent(1)}__lastResult = ${resultVar};`);
  }

  _emitSelectCore(query, lines, indent, resultVar) {
    const sourceName = JSON.stringify(query.from.name);
    const srcAlias = query.from.alias || query.from.name;
    let env = {
      rowVar: 'row',
      aliases: new Map([[srcAlias, 'row']]),
    };

    lines.push(`${indent(1)}let ${resultVar} = [...__getCollection(${sourceName})];`);

    if (query.join) {
      this._joinToJS(query, lines, indent, resultVar, srcAlias);
      const joinAlias = query.join.alias || query.join.source;
      env = {
        rowVar: 'row',
        aliases: new Map([
          [srcAlias, `row.__${srcAlias}`],
          [joinAlias, `row.__${joinAlias}`],
        ]),
      };
    }

    for (const u of query.unnest) {
      const pathCode = this._pathToAccessor(u.path, env);
      lines.push('');
      lines.push(`${indent(1)}// UNNEST(${u.path}) AS ${u.alias}`);
      lines.push(`${indent(1)}${resultVar} = ${resultVar}.flatMap(row => {`);
      lines.push(`${indent(2)}const arr = ${pathCode};`);
      lines.push(`${indent(2)}if (!Array.isArray(arr)) return [__copyAliases({ ...row, ${u.alias}: arr }, row)];`);
      lines.push(`${indent(2)}return arr.map(${u.alias} => __copyAliases({ ...row, ${u.alias} }, row));`);
      lines.push(`${indent(1)}});`);
      env.aliases.set(u.alias, `row.${u.alias}`);
    }

    if (query.where) {
      const filterCode = this._exprToJS(query.where, env);
      lines.push('');
      lines.push(`${indent(1)}// WHERE`);
      lines.push(`${indent(1)}${resultVar} = ${resultVar}.filter(row => ${filterCode});`);
    }

    this._orderAndLimitToJS(query, lines, indent, resultVar, env);

    const sel = query.select;
    if (sel.type !== 'SelectAll') {
      const items = Array.isArray(sel) ? sel : [sel];
      lines.push('');
      lines.push(`${indent(1)}// SELECT`);
      const projections = items.map(item => {
        const key = item.alias || this._exprToLabel(item.expr);
        const val = this._exprToJS(item.expr, env);
        return `${indent(3)}${JSON.stringify(key)}: ${val}`;
      });
      lines.push(`${indent(1)}${resultVar} = ${resultVar}.map(row => ({`);
      lines.push(projections.join(',\n'));
      lines.push(`${indent(1)}}));`);
    }
  }

  _joinToJS(query, lines, indent, resultVar, srcAlias) {
    const joinAlias = query.join.alias || query.join.source;
    const joinKind = query.join.kind || 'inner';
    const suffix = this._nextTemp();
    const joinSrcVar = `__joinSrc${suffix}`;
    const naturalKeysVar = `__naturalKeys${suffix}`;
    const matchedRightVar = `__matchedRight${suffix}`;
    const joinedRowsVar = `__joinedRows${suffix}`;
    const condEnv = {
      rowVar: null,
      aliases: new Map([
        [srcAlias, srcAlias],
        [joinAlias, joinAlias],
      ]),
    };
    const condCode = query.join.natural
      ? `${naturalKeysVar}.every(key => ${srcAlias}?.[key] === ${joinAlias}?.[key])`
      : this._exprToJS(query.join.condition, condEnv);
    const commonFields = query.join.commonFields || [];

    lines.push('');
    lines.push(`${indent(1)}// ${query.join.natural ? 'NATURAL ' : ''}${joinKind.toUpperCase()} JOIN`);
    lines.push(`${indent(1)}const ${joinSrcVar} = __getCollection(${JSON.stringify(query.join.source)});`);
    if (query.join.natural) {
      if (commonFields.length > 0) {
        lines.push(`${indent(1)}const ${naturalKeysVar} = ${JSON.stringify(commonFields)};`);
      } else {
        lines.push(`${indent(1)}const ${naturalKeysVar} = [...new Set(${resultVar}.flatMap(row => Object.keys(row || {})))]`);
        lines.push(`${indent(2)}.filter(key => ${joinSrcVar}.some(row => Object.hasOwn(row || {}, key)));`);
      }
    }
    lines.push(`${indent(1)}const ${matchedRightVar} = new Set();`);
    lines.push(`${indent(1)}const ${joinedRowsVar} = [];`);
    lines.push(`${indent(1)}for (const ${srcAlias} of ${resultVar}) {`);
    lines.push(`${indent(2)}let __matched = false;`);
    lines.push(`${indent(2)}for (const [__rightIndex, ${joinAlias}] of ${joinSrcVar}.entries()) {`);
    lines.push(`${indent(3)}if (${condCode}) {`);
    lines.push(`${indent(4)}__matched = true;`);
    lines.push(`${indent(4)}${matchedRightVar}.add(__rightIndex);`);
    lines.push(`${indent(4)}${joinedRowsVar}.push(__mergeJoinRows(${srcAlias}, ${joinAlias}, ${JSON.stringify(srcAlias)}, ${JSON.stringify(joinAlias)}));`);
    lines.push(`${indent(3)}}`);
    lines.push(`${indent(2)}}`);
    if (joinKind === 'left' || joinKind === 'full') {
      lines.push(`${indent(2)}if (!__matched) ${joinedRowsVar}.push(__mergeJoinRows(${srcAlias}, null, ${JSON.stringify(srcAlias)}, ${JSON.stringify(joinAlias)}));`);
    }
    lines.push(`${indent(1)}}`);
    if (joinKind === 'right' || joinKind === 'full') {
      lines.push(`${indent(1)}for (const [__rightIndex, ${joinAlias}] of ${joinSrcVar}.entries()) {`);
      lines.push(`${indent(2)}if (!${matchedRightVar}.has(__rightIndex)) ${joinedRowsVar}.push(__mergeJoinRows(null, ${joinAlias}, ${JSON.stringify(srcAlias)}, ${JSON.stringify(joinAlias)}));`);
      lines.push(`${indent(1)}}`);
    }
    lines.push(`${indent(1)}${resultVar} = ${joinedRowsVar};`);
  }

  _orderAndLimitToJS(statement, lines, indent, resultVar, env) {
    if (statement.orderBy?.length > 0) {
      lines.push('');
      lines.push(`${indent(1)}// ORDER BY`);
      lines.push(`${indent(1)}${resultVar}.sort((a, b) => {`);
      const sortEnvA = this._sortEnv(env, 'a');
      const sortEnvB = this._sortEnv(env, 'b');
      for (const item of statement.orderBy) {
        const aPath = this._pathToAccessor(item.path, sortEnvA);
        const bPath = this._pathToAccessor(item.path, sortEnvB);
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

    if (statement.limit !== null && statement.limit !== undefined) {
      lines.push('');
      lines.push(`${indent(1)}// LIMIT`);
      lines.push(`${indent(1)}${resultVar} = ${resultVar}.slice(0, ${statement.limit});`);
    }
  }

  _updateToJS(statement, lines, indent) {
    const collection = JSON.stringify(statement.collection);
    const env = {
      rowVar: 'row',
      aliases: new Map([[statement.collection, 'row']]),
    };
    const condition = statement.where ? this._exprToJS(statement.where, env) : 'true';

    lines.push('');
    lines.push(`${indent(1)}// UPDATE ${statement.collection}`);
    lines.push(`${indent(1)}let __updated_${statement.collection} = 0;`);
    lines.push(`${indent(1)}data[${collection}] = __getCollection(${collection}).map(row => {`);
    lines.push(`${indent(2)}if (!(${condition})) return row;`);
    lines.push(`${indent(2)}__updated_${statement.collection}++;`);
    lines.push(`${indent(2)}const __next = { ...row };`);
    for (const assignment of statement.assignments) {
      lines.push(`${indent(2)}__setPath(__next, ${JSON.stringify(assignment.path.segments)}, ${this._exprToJS(assignment.expr, env)});`);
    }
    lines.push(`${indent(2)}return __next;`);
    lines.push(`${indent(1)}});`);
    lines.push(`${indent(1)}__mutated = true;`);
    lines.push(`${indent(1)}__mutations.push({ type: 'update', collection: ${collection}, count: __updated_${statement.collection} });`);
    lines.push(`${indent(1)}__lastResult = data;`);
  }

  _deleteToJS(statement, lines, indent) {
    const collection = JSON.stringify(statement.collection);
    const env = {
      rowVar: 'row',
      aliases: new Map([[statement.collection, 'row']]),
    };
    const condition = statement.where ? this._exprToJS(statement.where, env) : 'true';

    lines.push('');
    lines.push(`${indent(1)}// DELETE FROM ${statement.collection}`);
    lines.push(`${indent(1)}const __beforeDelete_${statement.collection} = __getCollection(${collection}).length;`);
    lines.push(`${indent(1)}data[${collection}] = __getCollection(${collection}).filter(row => !(${condition}));`);
    lines.push(`${indent(1)}__mutated = true;`);
    lines.push(`${indent(1)}__mutations.push({ type: 'delete', collection: ${collection}, count: __beforeDelete_${statement.collection} - data[${collection}].length });`);
    lines.push(`${indent(1)}__lastResult = data;`);
  }

  // ── Expression → JS ────────────────────────

  _exprToJS(expr, env) {
    if (!expr) return 'undefined';

    switch (expr.type) {
      case 'BinaryExpr':
        return this._binaryToJS(expr, env);

      case 'UnaryExpr':
        if (expr.op === 'NOT') return `!(${this._exprToJS(expr.operand, env)})`;
        if (expr.op === '-') return `-(${this._exprToJS(expr.operand, env)})`;
        return `${expr.op}(${this._exprToJS(expr.operand, env)})`;

      case 'Aggregate':
        return this._aggregateToJS(expr, env);

      case 'Path':
        return this._pathToAccessor(expr, env);

      case 'Literal':
        return this._literalToJS(expr);

      case 'ObjectLiteral':
        return this._objectLiteralToJS(expr, env);

      case 'ArrayLiteral':
        return `[${expr.items.map(item => this._exprToJS(item, env)).join(', ')}]`;

      default:
        return `/* unknown: ${expr.type} */`;
    }
  }

  _binaryToJS(expr, env) {
    const left = this._exprToJS(expr.left, env);
    const right = this._exprToJS(expr.right, env);
    if (expr.op === 'LIKE') return `__like(${left}, ${right}, false)`;
    if (expr.op === 'ILIKE') return `__like(${left}, ${right}, true)`;
    if (expr.op === 'NOT LIKE') return `!__like(${left}, ${right}, false)`;
    if (expr.op === 'NOT ILIKE') return `!__like(${left}, ${right}, true)`;

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

  _aggregateToJS(expr, env) {
    const segments = expr.path.segments;
    const rootPath = new PathLike([segments[0]]);
    const arrRoot = this._pathToAccessor(rootPath, env);
    const needsMap = segments.length > 1;
    const subPath = segments.slice(1).map(segment => `?.${segment}`).join('');
    const valuesExpr = needsMap ? `${arrRoot}.map(__el => __el${subPath})` : arrRoot;

    switch (expr.func) {
      case 'COUNT':
        return `(Array.isArray(${arrRoot}) ? ${arrRoot}.length : 0)`;
      case 'SUM':
        return `(Array.isArray(${arrRoot}) ? ${valuesExpr}.reduce((__s, __v) => __s + Number(__v || 0), 0) : 0)`;
      case 'AVG':
        return `(Array.isArray(${arrRoot}) && ${arrRoot}.length ? ${valuesExpr}.reduce((__s, __v) => __s + Number(__v || 0), 0) / ${arrRoot}.length : 0)`;
      case 'MIN':
        return `(Array.isArray(${arrRoot}) && ${arrRoot}.length ? Math.min(...${valuesExpr}.map(Number)) : null)`;
      case 'MAX':
        return `(Array.isArray(${arrRoot}) && ${arrRoot}.length ? Math.max(...${valuesExpr}.map(Number)) : null)`;
      default:
        return `/* unknown aggregate ${expr.func} */`;
    }
  }

  _pathToAccessor(pathNode, env) {
    if (!pathNode || !pathNode.segments) return 'undefined';
    const segments = pathNode.segments;
    const [first, ...rest] = segments;

    if (env?.aliases?.has(first)) {
      const root = env.aliases.get(first);
      if (rest.length === 0) return root;
      return `${root}${rest.map(segment => `?.${segment}`).join('')}`;
    }

    const rowVar = env?.rowVar;
    if (!rowVar) return segments.join('?.');
    if (segments.length === 1) return `${rowVar}.${segments[0]}`;
    return `${rowVar}?.${segments.join('?.')}`;
  }

  _literalToJS(expr) {
    if (expr.dataType === 'string') return JSON.stringify(expr.value);
    if (expr.dataType === 'null') return 'null';
    if (expr.dataType === 'boolean') return expr.value ? 'true' : 'false';
    return String(expr.value);
  }

  _objectLiteralToJS(expr, env) {
    const entries = Object.entries(expr.properties).map(([key, value]) =>
      `${JSON.stringify(key)}: ${this._exprToJS(value, env)}`
    );
    return `{ ${entries.join(', ')} }`;
  }

  _nextTemp() {
    const id = this._tempId || 0;
    this._tempId = id + 1;
    return id;
  }

  _sortEnv(env, rowVar) {
    const aliases = new Map();
    for (const [alias, accessor] of env.aliases || []) {
      aliases.set(alias, accessor.replace(/^row\b/, rowVar));
    }
    return { rowVar, aliases };
  }

  /**
   * Generate a human-readable label for a select expression.
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

class PathLike {
  constructor(segments) {
    this.segments = segments;
  }
}
