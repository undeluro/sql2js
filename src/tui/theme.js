// ──────────────────────────────────────────────
// TUI Theme — colors and styling constants
// ──────────────────────────────────────────────

import chalk from 'chalk';

// ── Color palette ─────────────────────────────
export const colors = {
  // Accent colors
  primary:    chalk.hex('#7C3AED'),    // violet
  secondary:  chalk.hex('#06B6D4'),    // cyan
  success:    chalk.hex('#10B981'),    // emerald
  error:      chalk.hex('#EF4444'),    // red
  warning:    chalk.hex('#F59E0B'),    // amber
  muted:      chalk.hex('#6B7280'),    // gray

  // Text colors
  heading:    chalk.bold.hex('#E5E7EB'),
  text:       chalk.hex('#D1D5DB'),
  dimText:    chalk.hex('#9CA3AF'),
  bright:     chalk.bold.hex('#F9FAFB'),

  // Syntax highlighting for SQL
  keyword:    chalk.bold.hex('#C084FC'),   // purple for keywords
  string:     chalk.hex('#34D399'),         // green for strings
  number:     chalk.hex('#FBBF24'),         // yellow for numbers
  operator:   chalk.hex('#67E8F9'),         // cyan for operators
  identifier: chalk.hex('#E5E7EB'),         // white for identifiers

  // Syntax highlighting for JS
  jsKeyword:  chalk.hex('#C084FC'),
  jsString:   chalk.hex('#34D399'),
  jsNumber:   chalk.hex('#FBBF24'),
  jsComment:  chalk.hex('#6B7280'),
  jsPunct:    chalk.hex('#67E8F9'),
};

// ── Box drawing ───────────────────────────────
export const box = {
  topLeft:     '╭',
  topRight:    '╮',
  bottomLeft:  '╰',
  bottomRight: '╯',
  horizontal:  '─',
  vertical:    '│',
};

export function drawBox(title, content, width = 60) {
  const innerWidth = width - 2;
  const titleStr = title ? ` ${title} ` : '';
  const titleLen = stripAnsi(titleStr).length;
  const topLine = box.topLeft +
    box.horizontal.repeat(1) +
    colors.primary(titleStr) +
    box.horizontal.repeat(Math.max(0, innerWidth - titleLen - 1)) +
    box.topRight;

  const bottomLine = box.bottomLeft +
    box.horizontal.repeat(innerWidth) +
    box.bottomRight;

  const lines = content.split('\n').map(line => {
    const stripped = stripAnsi(line);
    const pad = Math.max(0, innerWidth - stripped.length);
    return `${box.vertical} ${line}${' '.repeat(pad - 1)}${box.vertical}`;
  });

  return [
    colors.muted(topLine),
    ...lines.map(l => colors.muted(l.charAt(0)) + l.slice(1, -1) + colors.muted(l.charAt(l.length - 1))),
    colors.muted(bottomLine),
  ].join('\n');
}

// ── SQL syntax highlighting ───────────────────

const SQL_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'ORDER', 'BY', 'LIMIT',
  'UNNEST', 'AS', 'AND', 'OR', 'NOT', 'ASC', 'DESC',
  'GROUP', 'HAVING', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'NULL',
  'ARRAY_COUNT', 'ARRAY_SUM', 'ARRAY_AVG', 'ARRAY_MIN', 'ARRAY_MAX',
  'JOIN', 'ON', 'TRUE', 'FALSE', 'CREATE', 'COLLECTION',
  'INSERT', 'INTO', 'VALUE', 'UPDATE', 'SET', 'DELETE',
  'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER', 'NATURAL',
  'UNION', 'INTERSECT', 'EXCEPT', 'LIKE', 'ILIKE',
]);

export function highlightSQL(sql) {
  return sql.replace(/('[^']*'|"[^"]*")|(\b\d+\.?\d*\b)|([=!<>]+|[+\-*/])|(\b\w+\b)/g,
    (match, str, num, op, word) => {
      if (str) return colors.string(str);
      if (num) return colors.number(num);
      if (op)  return colors.operator(op);
      if (word && SQL_KEYWORDS.has(word.toUpperCase())) return colors.keyword(word.toUpperCase());
      return colors.identifier(match);
    }
  );
}

// ── JS syntax highlighting (basic) ────────────

const JS_KEYWORDS = new Set([
  'const', 'let', 'var', 'return', 'if', 'else', 'function',
  'true', 'false', 'null', 'undefined', 'new', 'typeof',
]);

export function highlightJS(code) {
  return code.split('\n').map(line => {
    // Comments
    if (line.trim().startsWith('//')) return colors.jsComment(line);
    return line.replace(/('[^']*'|"[^"]*"|`[^`]*`)|(\b\d+\.?\d*\b)|(\b\w+\b)/g,
      (match, str, num, word) => {
        if (str) return colors.jsString(str);
        if (num) return colors.jsNumber(num);
        if (word && JS_KEYWORDS.has(word)) return colors.jsKeyword(word);
        return match;
      }
    );
  }).join('\n');
}

// ── Helpers ───────────────────────────────────

function stripAnsi(str) {
  return str.replace(/\x1B\[\d+m/g, '').replace(/\x1B\[[\d;]*m/g, '');
}

export function pipelineBar(stages) {
  return stages.map(s => {
    const icon = s.status === 'ok' ? colors.success('✓') :
                 s.status === 'error' ? colors.error('✗') :
                 colors.muted('○');
    const name = s.status === 'error' ? colors.error(s.name) :
                 s.status === 'ok' ? colors.success(s.name) :
                 colors.muted(s.name);
    return `${icon} ${name}`;
  }).join(colors.muted(' → '));
}

export function formatTable(rows, columns, maxWidth = Math.max(20, (process.stdout.columns || 100) - 4)) {
  if (!rows || rows.length === 0) return colors.dimText('  (no results)');
  const displayColumns = [...(columns || [])];
  for (const row of rows) {
    for (const col of Object.keys(row || {})) {
      if (!displayColumns.includes(col)) displayColumns.push(col);
    }
  }
  columns = displayColumns;

  // Calculate column widths
  const widths = columns.map(col => {
    const headerLen = col.length;
    const maxDataLen = rows.reduce((max, row) => {
      const val = formatCell(row[col]);
      return Math.max(max, val.length);
    }, 0);
    return Math.max(headerLen, maxDataLen);
  });
  const usableWidth = Math.max(12, Math.floor(maxWidth) - 2);
  const tableWidth = () => widths.reduce((sum, width) => sum + width, 0) + (columns.length - 1) * 3;
  const minWidth = 6;

  while (tableWidth() > usableWidth && Math.max(...widths) > minWidth) {
    const widestIndex = widths.indexOf(Math.max(...widths));
    widths[widestIndex]--;
  }

  const headerLines = wrapRow(columns, widths);
  const sep = colors.muted(widths.map(w => '─'.repeat(w)).join('─┼─'));
  const header = headerLines.map(line => line.map((cell, i) =>
    colors.bright(cell.padEnd(widths[i]))
  ).join(colors.muted(' │ ')));

  const dataRows = rows.flatMap((row, rowIdx) => {
    const rowLines = wrapRow(columns.map(col => formatCell(row[col])), widths);
    return rowLines.map(line => {
      const rendered = line.map((cell, i) => cell.padEnd(widths[i])).join(colors.muted(' │ '));
      return rowIdx % 2 === 0 ? colors.text(rendered) : colors.dimText(rendered);
    });
  });

  return [
    ...header.map(line => `  ${line}`),
    `  ${sep}`,
    ...dataRows.map(r => `  ${r}`),
  ].join('\n');
}

function formatCell(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function wrapRow(values, widths) {
  const cells = values.map((value, index) => wrapCell(value, widths[index]));
  const lineCount = Math.max(...cells.map(cell => cell.length));
  return Array.from({ length: lineCount }, (_, lineIndex) =>
    cells.map(cell => cell[lineIndex] || '')
  );
}

function wrapCell(value, width) {
  const text = String(value ?? 'null');
  if (text.length === 0) return [''];
  if (width <= 0 || text.length <= width) return [text];

  const lines = [];
  for (let i = 0; i < text.length; i += width) {
    lines.push(text.slice(i, i + width));
  }
  return lines;
}
