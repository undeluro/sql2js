// ──────────────────────────────────────────────
// AST Builder — Visitor that converts ANTLR4
// parse tree into our clean AST nodes
// ──────────────────────────────────────────────

import JsonQueryVisitor from '../generated/JsonQueryVisitor.js';
import JsonQueryParser from '../generated/JsonQueryParser.js';
import {
  ProgramNode, QueryNode, SelectAllNode, SelectItemNode,
  SetOperationNode,
  CreateCollectionNode, InsertNode, UpdateNode, DeleteNode, AssignmentNode,
  SourceNode, JoinNode, UnnestNode,
  BinaryExprNode, UnaryExprNode, AggregateNode, ArrayAggregateNode,
  PathNode, LiteralNode, ObjectLiteralNode, ArrayLiteralNode, OrderItemNode, locFrom,
} from './nodes.js';

export default class ASTBuilder extends JsonQueryVisitor {

  // ── Program & Query ──────────────────────────

  visitProgram(ctx) {
    const statements = ctx.statement().map(s => this.visit(s));
    return new ProgramNode(statements, locFrom(ctx));
  }

  visitSelectStatement(ctx) {
    return this.visit(ctx.queryExpr());
  }

  visitCreateStatement(ctx) {
    return this.visit(ctx.createStmt());
  }

  visitInsertStatement(ctx) {
    return this.visit(ctx.insertStmt());
  }

  visitUpdateStatement(ctx) {
    return this.visit(ctx.updateStmt());
  }

  visitDeleteStatement(ctx) {
    return this.visit(ctx.deleteStmt());
  }

  visitQueryExpr(ctx) {
    const base = this.visit(ctx.selectCore());
    const tails = ctx.setTail() || [];

    const orderByCtx = ctx.orderByClause();
    let orderBy = [];
    if (orderByCtx) {
      orderBy = orderByCtx.orderItem().map(o => this.visit(o));
    }

    const limitCtx = ctx.limitClause();
    let limit = null;
    if (limitCtx) {
      limit = parseInt(limitCtx.INTEGER_LIT().getText(), 10);
    }

    if (tails.length === 0) {
      base.orderBy = orderBy;
      base.limit = limit;
      return base;
    }

    return new SetOperationNode({
      base,
      operations: tails.map((tail, index) => ({
        op: tail.setOp().getText().toUpperCase(),
        query: this.visit(tail.selectCore()),
      })),
      orderBy,
      limit,
      loc: locFrom(ctx),
    });
  }

  visitSelectCore(ctx) {
    const select = this.visit(ctx.selectList());
    const from = this.visit(ctx.source());

    const joinCtx = ctx.joinClause();
    const join = joinCtx ? this.visit(joinCtx) : null;

    const unnest = (ctx.unnestClause() || []).map(u => this.visit(u));

    const whereCtx = ctx.whereClause();
    const where = whereCtx ? this.visit(whereCtx) : null;
    const groupByCtx = ctx.groupByClause();
    const groupBy = groupByCtx ? groupByCtx.path().map(p => this.visit(p)) : [];
    const havingCtx = ctx.havingClause();
    const having = havingCtx ? this.visit(havingCtx) : null;
    const orderBy = [];
    const limit = null;

    return new QueryNode({
      select, from, join, unnest, where, groupBy, having, orderBy, limit,
      loc: locFrom(ctx),
    });
  }

  // ── CREATE / INSERT / UPDATE / DELETE ───────

  visitCreateStmt(ctx) {
    return new CreateCollectionNode(
      ctx.IDENTIFIER().getText(),
      this.visit(ctx.arrayLiteral()),
      locFrom(ctx)
    );
  }

  visitInsertStmt(ctx) {
    return new InsertNode(
      ctx.IDENTIFIER().getText(),
      this.visit(ctx.objectLiteral()),
      locFrom(ctx)
    );
  }

  visitUpdateStmt(ctx) {
    const whereCtx = ctx.whereClause();
    return new UpdateNode(
      ctx.IDENTIFIER().getText(),
      ctx.assignment().map(a => this.visit(a)),
      whereCtx ? this.visit(whereCtx) : null,
      locFrom(ctx)
    );
  }

  visitDeleteStmt(ctx) {
    const whereCtx = ctx.whereClause();
    return new DeleteNode(
      ctx.IDENTIFIER().getText(),
      whereCtx ? this.visit(whereCtx) : null,
      locFrom(ctx)
    );
  }

  visitAssignment(ctx) {
    return new AssignmentNode(
      this.visit(ctx.path()),
      this.visit(ctx.expr()),
      locFrom(ctx)
    );
  }

  // ── SELECT ───────────────────────────────────

  visitSelectAll(ctx) {
    return new SelectAllNode(locFrom(ctx));
  }

  visitSelectItems(ctx) {
    return ctx.selectItem().map(si => this.visit(si));
  }

  visitSelectItem(ctx) {
    const expr = this.visit(ctx.expr());
    const identifiers = ctx.IDENTIFIER();
    const alias = identifiers ? identifiers.getText() : null;
    return new SelectItemNode(expr, alias, locFrom(ctx));
  }

  // ── FROM / JOIN / UNNEST ─────────────────────

  visitSource(ctx) {
    const identifiers = ctx.IDENTIFIER();
    const name = identifiers[0].getText();
    const alias = identifiers.length > 1 ? identifiers[1].getText() : null;
    return new SourceNode(name, alias, locFrom(ctx));
  }

  visitJoinClause(ctx) {
    const identifiers = ctx.IDENTIFIER();
    const source = identifiers[0].getText();
    const alias = identifiers.length > 1 ? identifiers[1].getText() : null;
    const condition = ctx.expr() ? this.visit(ctx.expr()) : null;
    const natural = Boolean(ctx.NATURAL());
    const joinTypeCtx = ctx.joinType();
    const kind = joinTypeCtx ? normalizeJoinKind(joinTypeCtx.getText()) : 'inner';
    return new JoinNode(source, alias, condition, locFrom(ctx), kind, natural);
  }

  visitUnnestClause(ctx) {
    const path = this.visit(ctx.path());
    const alias = ctx.IDENTIFIER().getText();
    return new UnnestNode(path, alias, locFrom(ctx));
  }

  // ── WHERE ────────────────────────────────────

  visitWhereClause(ctx) {
    return this.visit(ctx.expr());
  }

  visitHavingClause(ctx) {
    return this.visit(ctx.expr());
  }

  // ── ORDER BY ─────────────────────────────────

  visitOrderItem(ctx) {
    const path = this.visit(ctx.path());
    const dirToken = ctx.direction;
    const direction = dirToken ? dirToken.text.toUpperCase() : 'ASC';
    return new OrderItemNode(path, direction, locFrom(ctx));
  }

  // ── Expressions ──────────────────────────────

  visitOrExpr(ctx) {
    const left = this.visit(ctx.expr(0));
    const right = this.visit(ctx.expr(1));
    return new BinaryExprNode('OR', left, right, locFrom(ctx));
  }

  visitAndExpr(ctx) {
    const left = this.visit(ctx.expr(0));
    const right = this.visit(ctx.expr(1));
    return new BinaryExprNode('AND', left, right, locFrom(ctx));
  }

  visitNotExpr(ctx) {
    const operand = this.visit(ctx.expr());
    return new UnaryExprNode('NOT', operand, locFrom(ctx));
  }

  visitCompareExpr(ctx) {
    const left = this.visit(ctx.expr(0));
    const right = this.visit(ctx.expr(1));
    const op = normalizeComparisonOperator(ctx.compOp().getText());
    return new BinaryExprNode(op, left, right, locFrom(ctx));
  }

  visitAddExpr(ctx) {
    const left = this.visit(ctx.expr(0));
    const right = this.visit(ctx.expr(1));
    // The operator token is between the two expr children
    const op = ctx.PLUS() ? '+' : '-';
    return new BinaryExprNode(op, left, right, locFrom(ctx));
  }

  visitMulExpr(ctx) {
    const left = this.visit(ctx.expr(0));
    const right = this.visit(ctx.expr(1));
    const op = ctx.STAR() ? '*' : '/';
    return new BinaryExprNode(op, left, right, locFrom(ctx));
  }

  visitUnaryMinus(ctx) {
    const operand = this.visit(ctx.expr());
    return new UnaryExprNode('-', operand, locFrom(ctx));
  }

  visitPrimaryExpr(ctx) {
    return this.visit(ctx.primary());
  }

  // ── Primary expressions ──────────────────────

  visitAggExpr(ctx) {
    const func = ctx.aggFunc().getText().toUpperCase();
    // Normalize MIN_F/MAX_F → MIN/MAX
    const normalizedFunc = func === 'MIN' ? 'MIN' : func === 'MAX' ? 'MAX' : func;
    const argCtx = ctx.aggregateArg();
    const isStar = Boolean(argCtx.STAR());
    const arg = isStar ? null : this.visit(argCtx.expr());
    return new AggregateNode(normalizedFunc, arg, locFrom(ctx), isStar);
  }

  visitArrayAggExpr(ctx) {
    const func = ctx.arrayAggFunc().getText().toUpperCase();
    const path = this.visit(ctx.path());
    return new ArrayAggregateNode(func, path, locFrom(ctx));
  }

  visitPathExpr(ctx) {
    return this.visit(ctx.path());
  }

  visitLiteralExpr(ctx) {
    return this.visit(ctx.literal());
  }

  visitObjectExpr(ctx) {
    return this.visit(ctx.objectLiteral());
  }

  visitArrayExpr(ctx) {
    return this.visit(ctx.arrayLiteral());
  }

  visitParenExpr(ctx) {
    return this.visit(ctx.expr());
  }

  // ── Leaf nodes ───────────────────────────────

  visitPath(ctx) {
    const segments = ctx.IDENTIFIER().map(id => id.getText());
    return new PathNode(segments, locFrom(ctx));
  }

  visitLiteral(ctx) {
    const loc = locFrom(ctx);
    if (ctx.INTEGER_LIT()) {
      return new LiteralNode(parseInt(ctx.getText(), 10), 'integer', loc);
    }
    if (ctx.FLOAT_LIT()) {
      return new LiteralNode(parseFloat(ctx.getText()), 'float', loc);
    }
    if (ctx.STRING_LIT()) {
      // Strip surrounding quotes and unescape
      const raw = ctx.getText();
      const inner = unescapeStringLiteral(raw);
      return new LiteralNode(inner, 'string', loc);
    }
    if (ctx.BOOLEAN_LIT()) {
      return new LiteralNode(ctx.getText().toLowerCase() === 'true', 'boolean', loc);
    }
    if (ctx.NULL()) {
      return new LiteralNode(null, 'null', loc);
    }
    throw new Error(`Unknown literal: ${ctx.getText()}`);
  }

  visitObjectLiteral(ctx) {
    const properties = {};
    for (const prop of ctx.objectProperty() || []) {
      const { key, value } = this.visit(prop);
      properties[key] = value;
    }
    return new ObjectLiteralNode(properties, locFrom(ctx));
  }

  visitObjectProperty(ctx) {
    return {
      key: this.visit(ctx.objectKey()),
      value: this.visit(ctx.expr()),
    };
  }

  visitObjectKey(ctx) {
    if (ctx.IDENTIFIER()) return ctx.IDENTIFIER().getText();
    const raw = ctx.STRING_LIT().getText();
    return unescapeStringLiteral(raw);
  }

  visitArrayLiteral(ctx) {
    return new ArrayLiteralNode((ctx.expr() || []).map(e => this.visit(e)), locFrom(ctx));
  }
}

function normalizeJoinKind(text) {
  const upper = text.toUpperCase();
  if (upper.startsWith('LEFT')) return 'left';
  if (upper.startsWith('RIGHT')) return 'right';
  if (upper.startsWith('FULL')) return 'full';
  return 'inner';
}

function normalizeComparisonOperator(text) {
  const upper = text.toUpperCase();
  if (upper === 'NOTLIKE') return 'NOT LIKE';
  if (upper === 'NOTILIKE') return 'NOT ILIKE';
  if (upper === 'LIKE' || upper === 'ILIKE') return upper;
  return text;
}

function unescapeStringLiteral(raw) {
  const quote = raw[0];
  const inner = raw.slice(1, -1);
  return inner.replace(/\\(.)/g, (match, char) => {
    if (char === quote || char === '\\') return char;
    return match;
  });
}
