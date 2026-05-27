// ──────────────────────────────────────────────
// Runtime Executor
// Executes generated JavaScript on JSON data
// ──────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { CompilerError } from '../errors/errors.js';

export default class Executor {

  /**
   * Load JSON data from a file path
   */
  loadJSON(filePath) {
    try {
      const raw = readFileSync(filePath, 'utf-8');
      return JSON.parse(raw);
    } catch (e) {
      throw new CompilerError('runtime', `Failed to load JSON file '${filePath}': ${e.message}`, null);
    }
  }

  /**
   * Execute generated JS code on data.
   * @param {string} code — the generated function string
   * @param {any} data — primary JSON data (FROM source)
   * @param {any} joinData — optional JOIN data source
   * @returns {{ result: any, error: CompilerError|null }}
   */
  execute(code, data, joinData = null) {
    try {
      // We use Function constructor instead of eval — slightly safer,
      // creates a new function scope
      const fn = new Function('return ' + code)();
      const result = fn(data, joinData);
      return { result, error: null };
    } catch (e) {
      return {
        result: null,
        error: new CompilerError('runtime', e.message, null),
      };
    }
  }
}
