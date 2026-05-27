// ──────────────────────────────────────────────
// AST Builder — Visitor that converts ANTLR4
// parse tree into our clean AST nodes
// ──────────────────────────────────────────────

import JsonQueryVisitor from '../generated/JsonQueryVisitor.js';
import JsonQueryParser from '../generated/JsonQueryParser.js';
import {
  ProgramNode, QueryNode, SelectAllNode, SelectItemNode,
  SourceNode, JoinNode, UnnestNode,
  BinaryExprNode, UnaryExprNode, AggregateNode,
  PathNode, LiteralNode, OrderItemNode, locFrom,
} from './nodes.js';

export default class ASTBuilder extends JsonQueryVisitor {

  // ── Program & Query ──────────────────────────

  visitProgram(ctx) {
    const queries = ctx.query().map(q => this.visit(q));
    return new ProgramNode(queries, locFrom(ctx));
  }

  visitQuery(ctx) {
    return this.visit(ctx.selectStmt());
  }

  visitSelectStmt(ctx) {
    const select = this.visit(ctx.selectList());
    const from = this.visit(ctx.source());

    const joinCtx = ctx.joinClause();
    const join = joinCtx ? this.visit(joinCtx) : null;

    const unnest = (ctx.unnestClause() || []).map(u => this.visit(u));

    const whereCtx = ctx.whereClause();
    const where = whereCtx ? this.visit(whereCtx) : null;

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

    return new QueryNode({
      select, from, join, unnest, where, orderBy, limit,
      loc: locFrom(ctx),
    });
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
    const condition = this.visit(ctx.expr());
    return new JoinNode(source, alias, condition, locFrom(ctx));
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
    const op = ctx.compOp().getText();
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
    const path = this.visit(ctx.path());
    return new AggregateNode(normalizedFunc, path, locFrom(ctx));
  }

  visitPathExpr(ctx) {
    return this.visit(ctx.path());
  }

  visitLiteralExpr(ctx) {
    return this.visit(ctx.literal());
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
      const inner = raw.slice(1, -1).replace(/\\(.)/g, '$1');
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
}
