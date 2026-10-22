import {DatabaseSync} from 'node:sqlite';
import {readFileSync, readdirSync} from 'node:fs';

// Synthetic in-memory D1-shaped adapter. It does not claim to be hosted D1.
export function migratedDatabase() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys=ON');
  for (const file of readdirSync(new URL('../../drizzle/', import.meta.url)).filter(x => /^\d{4}_.*\.sql$/.test(x)).sort()) {
    sql.exec('BEGIN');
    try { sql.exec(readFileSync(new URL('../../drizzle/' + file, import.meta.url), 'utf8')); sql.exec('COMMIT'); }
    catch (error) { sql.exec('ROLLBACK'); sql.close(); throw error; }
  }
  return {sql,
    prepare(query) {
      const statement = sql.prepare(query);
      return {bind(...values) {
        return {
          async first() { return statement.get(...values) ?? null; },
          async all() { return {results: statement.all(...values)}; },
          async run() { const r = statement.run(...values); return {success: true, meta: {changes: Number(r.changes)}}; },
        };
      }};
    },
    async batch(statements) {
      sql.exec('BEGIN');
      try { const result = []; for (const statement of statements) result.push(await statement.run()); sql.exec('COMMIT'); return result; }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
    close() { sql.close(); },
  };
}
