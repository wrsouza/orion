import { Blueprint } from '../Blueprint';
import { ColumnDefinition } from '../ColumnDefinition';
import { ForeignKeyDefinition } from '../ForeignKeyDefinition';
import { CompiledSchema, SchemaGrammar } from './SchemaGrammar';

/**
 * Compiles `Blueprint` state into SQLite-flavoured DDL.
 *
 * SQLite limitations to be aware of:
 * - ALTER TABLE only supports ADD COLUMN (no DROP COLUMN before 3.35, no RENAME COLUMN before 3.25)
 *   We compile DROP COLUMN as a comment so callers can decide how to handle it.
 * - Foreign key constraints must be declared inline in CREATE TABLE.
 *   ALTER TABLE ADD CONSTRAINT is not supported — FKs added via `alter()` are compiled
 *   as a comment warning.
 * - No BIGSERIAL/SERIAL — INTEGER PRIMARY KEY AUTOINCREMENT is the equivalent.
 * - BOOLEAN is stored as INTEGER (0/1).
 * - No ENUM — stored as TEXT with a CHECK constraint.
 * - No JSONB — stored as TEXT.
 * - No BYTEA — stored as BLOB.
 * - Standalone indexes (CREATE INDEX) are supported and emitted separately.
 */
export class SQLiteSchemaGrammar implements SchemaGrammar {
  compileCreate(blueprint: Blueprint): CompiledSchema {
    const columnDefs = blueprint.columns.map((col) => this.compileColumn(col));
    const lines: string[] = [...columnDefs];

    for (const idx of blueprint.indexes) {
      if (idx.type === 'primary') {
        const cols = idx.columns.map((c) => this.wrap(c)).join(', ');
        lines.push(`PRIMARY KEY (${cols})`);
      }
    }

    // FK constraints inline (required by SQLite)
    for (const fk of blueprint.foreignKeys) {
      lines.push(this.compileForeignKeyInline(fk));
    }

    const createTable = `CREATE TABLE ${this.wrap(blueprint.table)} (\n  ${lines.join(',\n  ')}\n)`;

    const indexes = this.compileStandaloneIndexes(blueprint);

    // SQLite: FKs are already inline — no ALTER TABLE ADD CONSTRAINT
    return { createTable, indexes, foreignKeys: [] };
  }

  compileAlter(blueprint: Blueprint): CompiledSchema {
    const alterStatements: string[] = [];
    const table = this.wrap(blueprint.table);

    // ADD COLUMN is supported
    for (const col of blueprint.columns) {
      alterStatements.push(`ALTER TABLE ${table} ADD COLUMN ${this.compileColumn(col)}`);
    }

    // DROP COLUMN: supported since SQLite 3.35.0 (released 2021-03-12)
    for (const name of blueprint.droppedColumns) {
      alterStatements.push(`ALTER TABLE ${table} DROP COLUMN ${this.wrap(name)}`);
    }

    // DROP INDEX: separate statement (not ALTER TABLE)
    for (const name of blueprint.droppedIndexes) {
      alterStatements.push(`DROP INDEX IF EXISTS ${this.wrap(name)}`);
    }

    // DROP FOREIGN KEY: not supported in SQLite — emit a no-op comment
    for (const name of blueprint.droppedForeignKeys) {
      alterStatements.push(
        `-- SQLite does not support DROP FOREIGN KEY (${name}); recreate the table if needed`
      );
    }

    // FK additions via ALTER are not supported — emit warning comments
    for (const fk of blueprint.foreignKeys) {
      alterStatements.push(
        `-- SQLite does not support ADD CONSTRAINT via ALTER TABLE; FK (${fk.columns.join(', ')}) ignored`
      );
    }

    const indexes = this.compileStandaloneIndexes(blueprint);

    return { alterTable: alterStatements, indexes, foreignKeys: [] };
  }

  compileDrop(table: string): string {
    return `DROP TABLE ${this.wrap(table)}`;
  }

  compileDropIfExists(table: string): string {
    return `DROP TABLE IF EXISTS ${this.wrap(table)}`;
  }

  compileTableExists(table: string, _schema?: string): string {
    return `SELECT EXISTS (
      SELECT 1 FROM sqlite_master
      WHERE type = 'table' AND name = '${table}'
    ) AS "exists"`;
  }

  compileColumnListing(table: string, _schema?: string): string {
    return `PRAGMA table_info(${this.wrap(table)})`;
  }

  // ── Column compilation ────────────────────────────────────────────────────

  private compileColumn(col: ColumnDefinition): string {
    const isAutoIncrement = col.type === 'bigIncrements' || col.type === 'increments';
    const parts: string[] = [this.wrap(col.name), this.getColumnType(col)];

    // AUTO_INCREMENT types already embed NOT NULL PRIMARY KEY AUTOINCREMENT
    if (!isAutoIncrement) {
      if (col.modifiers.primary) {
        parts.push('NOT NULL PRIMARY KEY');
      } else if (!col.modifiers.nullable) {
        parts.push('NOT NULL');
      } else {
        parts.push('NULL');
      }

      if (col.modifiers.hasDefault) {
        parts.push(`DEFAULT ${this.formatDefault(col.modifiers.default)}`);
      }

      if (col.modifiers.unique) {
        parts.push('UNIQUE');
      }
    }

    return parts.join(' ');
  }

  private getColumnType(col: ColumnDefinition): string {
    switch (col.type) {
      case 'bigIncrements':
      case 'increments':
        return 'INTEGER PRIMARY KEY AUTOINCREMENT';
      case 'bigInteger':
      case 'integer':
      case 'smallInteger':
      case 'tinyInteger':
        return 'INTEGER';
      case 'boolean':
        return 'INTEGER'; // 0 / 1
      case 'char':
      case 'string':
      case 'text':
      case 'mediumText':
      case 'longText':
      case 'uuid':
      case 'ulid':
        return 'TEXT';
      case 'float':
      case 'double':
      case 'decimal':
        return 'REAL';
      case 'json':
      case 'jsonb':
        return 'TEXT'; // stored as JSON string
      case 'timestamp':
      case 'timestampTz':
      case 'date':
      case 'time':
        return 'TEXT'; // ISO 8601 strings
      case 'binary':
        return 'BLOB';
      case 'enum':
        if (!col.enumValues || col.enumValues.length === 0) {
          throw new Error(`[orion] Enum column "${col.name}" must have values.`);
        }
        return `TEXT CHECK(${this.wrap(col.name)} IN (${col.enumValues.map((v) => `'${v}'`).join(', ')}))`;
      default:
        throw new Error(`[orion] Unknown column type: "${col.type}"`);
    }
  }

  private formatDefault(value: unknown): string {
    if (value === null) return 'NULL';
    if (typeof value === 'boolean') return value ? '1' : '0';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'string') {
      if (value.startsWith('(') && value.endsWith(')')) return value;
      return `'${value.replace(/'/g, "''")}'`;
    }
    return `'${JSON.stringify(value)}'`;
  }

  // ── Inline foreign key (CREATE TABLE only) ────────────────────────────────

  private compileForeignKeyInline(fk: ForeignKeyDefinition): string {
    if (!fk.referencedTable) {
      throw new Error(`[orion] Foreign key must reference a table via .on()`);
    }
    const cols = fk.columns.map((c) => this.wrap(c)).join(', ');
    const refCols = fk.referencedColumns.map((c) => this.wrap(c)).join(', ');

    return (
      `FOREIGN KEY (${cols}) ` +
      `REFERENCES ${this.wrap(fk.referencedTable)} (${refCols}) ` +
      `ON DELETE ${fk.onDeleteAction} ` +
      `ON UPDATE ${fk.onUpdateAction}`
    );
  }

  // ── Standalone indexes ────────────────────────────────────────────────────

  private compileStandaloneIndexes(blueprint: Blueprint): string[] {
    const statements: string[] = [];
    const table = blueprint.table;

    for (const idx of blueprint.indexes) {
      if (idx.type === 'primary') continue;
      const cols = idx.columns.map((c) => this.wrap(c)).join(', ');
      const idxName = idx.name ?? this.defaultIndexName(table, idx.columns, idx.type);

      if (idx.type === 'unique') {
        statements.push(
          `CREATE UNIQUE INDEX ${this.wrap(idxName)} ON ${this.wrap(table)} (${cols})`
        );
      } else {
        statements.push(`CREATE INDEX ${this.wrap(idxName)} ON ${this.wrap(table)} (${cols})`);
      }
    }

    for (const col of blueprint.columns) {
      if (col.modifiers.index && !col.modifiers.unique) {
        const idxName = this.defaultIndexName(table, [col.name], 'index');
        statements.push(
          `CREATE INDEX ${this.wrap(idxName)} ON ${this.wrap(table)} (${this.wrap(col.name)})`
        );
      }
    }

    return statements;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private wrap(value: string): string {
    if (value.startsWith('"')) return value;
    if (value.includes('.')) {
      return value
        .split('.')
        .map((p) => `"${p}"`)
        .join('.');
    }
    return `"${value}"`;
  }

  private defaultIndexName(table: string, columns: string[], type: string): string {
    return `${table}_${columns.join('_')}_${type}`;
  }
}
