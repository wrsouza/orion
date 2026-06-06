import { QueryBuilder } from '../QueryBuilder';
import { CompiledQuery } from './QueryGrammar';
import { MySQLQueryGrammar } from './MySQLQueryGrammar';

/**
 * Extends `MySQLQueryGrammar` with MariaDB-specific SQL.
 *
 * Key differences vs MySQL:
 * - `INSERT … RETURNING` is supported since MariaDB 10.5 — used for `insertGetId`
 *   so the adapter can read the PK from the result set instead of `LAST_INSERT_ID()`.
 * - `UPDATE … RETURNING` and `DELETE … RETURNING` are also available (10.5+),
 *   exposed here as `compileUpdateReturning` / `compileDeleteReturning` for advanced use.
 * - `INSERT OR IGNORE` → `INSERT IGNORE` (inherited, same as MySQL).
 * - `ON DUPLICATE KEY UPDATE` upsert (inherited, same as MySQL).
 * - Everything else (SELECT, WHERE, JOIN, GROUP BY, HAVING, ORDER BY, LIMIT/OFFSET,
 *   backtick quoting, `?` params) is identical to MySQL — inherited unchanged.
 */
export class MariaDBQueryGrammar extends MySQLQueryGrammar {
  /**
   * MariaDB 10.5+: use `RETURNING` to get the inserted PK in a single round-trip.
   * Falls back to MySQL behaviour (read `lastInsertRowid` from adapter) for older versions.
   */
  compileInsertGetId(builder: QueryBuilder, values: Record<string, unknown>): CompiledQuery {
    const compiled = this.compileInsert(builder, [values]);
    const pk = builder.primaryKey ?? 'id';
    return {
      sql: `${compiled.sql} RETURNING ${this.wrap(pk)}`,
      bindings: compiled.bindings,
    };
  }

  /**
   * MariaDB 10.5+: `UPDATE … RETURNING columns`.
   *
   * ```ts
   * grammar.compileUpdateReturning(builder, { name: 'Alice' }, ['id', 'name'])
   * // UPDATE `users` SET `name` = ? WHERE … RETURNING `id`, `name`
   * ```
   */
  compileUpdateReturning(
    builder: QueryBuilder,
    values: Record<string, unknown>,
    columns: string[]
  ): CompiledQuery {
    const compiled = this.compileUpdate(builder, values);
    const cols = columns.map((c) => this.wrap(c)).join(', ');
    return {
      sql: `${compiled.sql} RETURNING ${cols}`,
      bindings: compiled.bindings,
    };
  }

  /**
   * MariaDB 10.5+: `DELETE … RETURNING columns`.
   *
   * ```ts
   * grammar.compileDeleteReturning(builder, ['id'])
   * // DELETE FROM `users` WHERE … RETURNING `id`
   * ```
   */
  compileDeleteReturning(builder: QueryBuilder, columns: string[]): CompiledQuery {
    const compiled = this.compileDelete(builder);
    const cols = columns.map((c) => this.wrap(c)).join(', ');
    return {
      sql: `${compiled.sql} RETURNING ${cols}`,
      bindings: compiled.bindings,
    };
  }
}
