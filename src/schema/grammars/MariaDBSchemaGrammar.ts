import { Blueprint } from '../Blueprint';
import { ColumnDefinition } from '../ColumnDefinition';
import { MySQLSchemaGrammar } from './MySQLSchemaGrammar';
import { CompiledSchema } from './SchemaGrammar';

/**
 * Extends `MySQLSchemaGrammar` with MariaDB-specific DDL.
 *
 * Key differences vs MySQL:
 * - `JSON` is a real type alias for `LONGTEXT` with a JSON_VALID check (MariaDB 10.2+).
 *   We emit `JSON` and let MariaDB handle it — behaviour is the same on 10.2+.
 * - `UUID` columns: MariaDB 10.7+ has a native `UUID` type. Older versions use `CHAR(36)`.
 *   We emit `UUID` (10.7+) and document this in the type comment.
 * - `RETURNS NULL ON NULL INPUT` / `DETERMINISTIC` not relevant here.
 * - Column comments are emitted inline (same as MySQL — inherited).
 * - `DROP CONSTRAINT` vs `DROP FOREIGN KEY`: MariaDB accepts both syntaxes; we keep
 *   `DROP FOREIGN KEY` (inherited from MySQL) which works on all versions.
 * - `CREATE TABLE … ENGINE=InnoDB` works on MariaDB (inherited unchanged).
 * - `TRUNCATE TABLE` without CASCADE (inherited unchanged).
 */
export class MariaDBSchemaGrammar extends MySQLSchemaGrammar {
  // ── Override column type map ──────────────────────────────────────────────

  protected getColumnType(col: ColumnDefinition): string {
    switch (col.type) {
      case 'uuid':
        // MariaDB 10.7+ has a native UUID type (stored as 16-byte binary, displayed as string)
        return 'UUID';

      case 'jsonb':
        // MariaDB has no JSONB — both json and jsonb map to JSON (LONGTEXT alias with JSON_VALID)
        return 'JSON';

      default:
        return super.getColumnType(col);
    }
  }

  // ── compileCreate: add MariaDB-specific table options ────────────────────

  compileCreate(blueprint: Blueprint): CompiledSchema {
    const base = super.compileCreate(blueprint);
    // Replace MySQL engine clause with MariaDB equivalent (identical syntax, just documenting intent)
    // MariaDB supports the same ENGINE=InnoDB syntax — no change needed.
    return base;
  }

  // ── compileTableExists: MariaDB-compatible query ──────────────────────────

  compileTableExists(table: string, schema?: string): string {
    const db = schema ? `'${schema}'` : 'DATABASE()';
    return `SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = ${db}
      AND table_name = '${table}'
    ) AS \`exists\``;
  }
}
