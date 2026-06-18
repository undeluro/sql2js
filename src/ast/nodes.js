// ──────────────────────────────────────────────
// AST Node Classes for JsonQuery
// ──────────────────────────────────────────────

export class ProgramNode {
  constructor(statements, loc) {
    this.type = 'Program';
    this.statements = statements;
    this.queries = statements;
    this.loc = loc;
  }
}

export class QueryNode {
  constructor({ select, from, join, unnest, where, groupBy, having, orderBy, limit, loc }) {
    this.type = 'Query';
    this.select = select;       // SelectAllNode | [SelectItemNode]
    this.from = from;           // SourceNode
    this.join = join || null;   // JoinNode | null
    this.unnest = unnest || []; // [UnnestNode]
    this.where = where || null; // ExprNode | null
    this.groupBy = groupBy || []; // [PathNode]
    this.having = having || null; // ExprNode | null
    this.orderBy = orderBy || []; // [OrderItemNode]
    this.limit = limit;         // number | null
    this.loc = loc;
  }
}

export class SetOperationNode {
  constructor({ base, operations, orderBy, limit, loc }) {
    this.type = 'SetOperation';
    this.base = base;
    this.operations = operations || []; // [{ op: 'UNION'|'INTERSECT'|'EXCEPT', query: QueryNode }]
    this.orderBy = orderBy || [];
    this.limit = limit;
    this.loc = loc;
  }
}

export class CreateCollectionNode {
  constructor(name, records, loc) {
    this.type = 'CreateCollection';
    this.name = name;
    this.records = records;
    this.loc = loc;
  }
}

export class InsertNode {
  constructor(collection, record, loc) {
    this.type = 'Insert';
    this.collection = collection;
    this.record = record;
    this.loc = loc;
  }
}

export class UpdateNode {
  constructor(collection, assignments, where, loc) {
    this.type = 'Update';
    this.collection = collection;
    this.assignments = assignments;
    this.where = where || null;
    this.loc = loc;
  }
}

export class DeleteNode {
  constructor(collection, where, loc) {
    this.type = 'Delete';
    this.collection = collection;
    this.where = where || null;
    this.loc = loc;
  }
}

export class AssignmentNode {
  constructor(path, expr, loc) {
    this.type = 'Assignment';
    this.path = path;
    this.expr = expr;
    this.loc = loc;
  }
}

export class SelectAllNode {
  constructor(loc) {
    this.type = 'SelectAll';
    this.loc = loc;
  }
}

export class SelectItemNode {
  constructor(expr, alias, loc) {
    this.type = 'SelectItem';
    this.expr = expr;
    this.alias = alias || null;
    this.loc = loc;
  }
}

export class SelectWildcardNode {
  constructor(path, loc) {
    this.type = 'SelectWildcard';
    this.path = path;
    this.loc = loc;
  }
}

export class SourceNode {
  constructor(name, alias, loc) {
    this.type = 'Source';
    this.name = name;
    this.alias = alias || null;
    this.loc = loc;
  }
}

export class JoinNode {
  constructor(source, alias, condition, loc, kind = 'inner', natural = false) {
    this.type = 'Join';
    this.source = source;
    this.alias = alias || null;
    this.condition = condition;
    this.kind = kind;
    this.natural = natural;
    this.commonFields = null;
    this.loc = loc;
  }
}

export class UnnestNode {
  constructor(path, alias, loc) {
    this.type = 'Unnest';
    this.path = path;
    this.alias = alias;
    this.loc = loc;
  }
}

export class BinaryExprNode {
  constructor(op, left, right, loc) {
    this.type = 'BinaryExpr';
    this.op = op;
    this.left = left;
    this.right = right;
    this.loc = loc;
  }
}

export class UnaryExprNode {
  constructor(op, operand, loc) {
    this.type = 'UnaryExpr';
    this.op = op;
    this.operand = operand;
    this.loc = loc;
  }
}

export class AggregateNode {
  constructor(func, arg, loc, isStar = false) {
    this.type = 'Aggregate';
    this.func = func;   // 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX'
    this.arg = arg || null;
    this.path = arg?.type === 'Path' ? arg : null;
    this.isStar = isStar;
    this.loc = loc;
  }
}

export class ArrayAggregateNode {
  constructor(func, path, loc) {
    this.type = 'ArrayAggregate';
    this.func = func;   // 'ARRAY_COUNT' | 'ARRAY_SUM' | 'ARRAY_AVG' | 'ARRAY_MIN' | 'ARRAY_MAX'
    this.path = path;
    this.loc = loc;
  }
}

export class PathNode {
  constructor(segments, loc) {
    this.type = 'Path';
    this.segments = segments; // ['address', 'city']
    this.loc = loc;
  }

  toString() {
    return this.segments.join('.');
  }
}

export class LiteralNode {
  constructor(value, dataType, loc) {
    this.type = 'Literal';
    this.value = value;
    this.dataType = dataType; // 'integer' | 'float' | 'string' | 'boolean' | 'null'
    this.loc = loc;
  }
}

export class ObjectLiteralNode {
  constructor(properties, loc) {
    this.type = 'ObjectLiteral';
    this.properties = properties;
    this.loc = loc;
  }
}

export class ArrayLiteralNode {
  constructor(items, loc) {
    this.type = 'ArrayLiteral';
    this.items = items;
    this.loc = loc;
  }
}

export class OrderItemNode {
  constructor(path, direction, loc) {
    this.type = 'OrderItem';
    this.path = path;
    this.direction = direction; // 'ASC' | 'DESC'
    this.loc = loc;
  }
}

/**
 * Helper: extract location info from an ANTLR4 context or token
 */
export function locFrom(ctx) {
  if (!ctx) return null;
  const token = ctx.start || ctx.symbol || ctx;
  return {
    line: token.line,
    column: token.column,
  };
}
