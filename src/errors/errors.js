// ──────────────────────────────────────────────
// Custom Error Types with source location info
// ──────────────────────────────────────────────

export class CompilerError {
  constructor(phase, message, loc, details = null) {
    this.phase = phase;     // 'lexical' | 'syntax' | 'semantic' | 'compiletime' | 'runtime'
    this.message = message;
    this.loc = loc;         // { line, column } | null
    this.details = details; // optional extra diagnostic data
  }

  toString() {
    const pos = this.loc ? ` at ${this.loc.line}:${this.loc.column}` : '';
    return `[${this.phase}]${pos}: ${this.message}`;
  }
}

export function formatCompilerError(error, source = null) {
  const pos = error.loc ? ` at ${error.loc.line}:${error.loc.column}` : '';
  const lines = [`[${error.phase}]${pos}: ${error.message}`];

  if (source && error.loc) {
    const sourceLine = source.split(/\r?\n/)[error.loc.line - 1];
    if (sourceLine !== undefined) {
      lines.push(`  ${sourceLine}`);
      lines.push(`  ${' '.repeat(error.loc.column)}^`);
    }
  }

  if (error.details?.expected) {
    lines.push(`  expected: ${error.details.expected}`);
  }
  if (error.details?.offendingText) {
    lines.push(`  offending text: ${JSON.stringify(error.details.offendingText)}`);
  }

  return lines.join('\n');
}

/**
 * Custom ANTLR4 error listener that collects errors
 * instead of printing to stderr
 */
export class CollectingErrorListener {
  constructor(phase) {
    this.phase = phase;
    this.errors = [];
  }

  syntaxError(recognizer, offendingSymbol, line, column, msg, _e) {
    const details = {};
    const offendingText = offendingSymbol?.text;
    if (offendingText && offendingText !== '<EOF>') {
      details.offendingText = offendingText;
    }

    if (this.phase === 'syntax' && recognizer?.getExpectedTokens) {
      try {
        details.expected = recognizer
          .getExpectedTokens()
          .toString(recognizer.literalNames, recognizer.symbolicNames);
      } catch {
        // Expected-token formatting is best-effort only.
      }
    }

    this.errors.push(
      new CompilerError(
        this.phase,
        msg,
        { line, column },
        Object.keys(details).length > 0 ? details : null
      )
    );
  }
}
