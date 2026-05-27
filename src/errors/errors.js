// ──────────────────────────────────────────────
// Custom Error Types with source location info
// ──────────────────────────────────────────────

export class CompilerError {
  constructor(phase, message, loc) {
    this.phase = phase;     // 'lexer' | 'parser' | 'semantic' | 'codegen' | 'runtime'
    this.message = message;
    this.loc = loc;         // { line, column } | null
  }

  toString() {
    const pos = this.loc ? ` at ${this.loc.line}:${this.loc.column}` : '';
    return `[${this.phase}]${pos}: ${this.message}`;
  }
}

/**
 * Custom ANTLR4 error listener that collects errors
 * instead of printing to stderr
 */
export class CollectingErrorListener {
  constructor() {
    this.errors = [];
  }

  syntaxError(_recognizer, _offendingSymbol, line, column, msg, _e) {
    this.errors.push(
      new CompilerError(
        _offendingSymbol ? 'parser' : 'lexer',
        msg,
        { line, column }
      )
    );
  }
}
