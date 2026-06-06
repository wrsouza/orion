import { Blueprint } from '../Blueprint';
import { ColumnDefinition } from '../ColumnDefinition';
import { ForeignKeyDefinition } from '../ForeignKeyDefinition';
import { CompiledSchema, SchemaGrammar } from './SchemaGrammar';

/**
 * Compiles `Blueprint` state into MySQL-flavoured DDL.
 *
 * Notable differences from Postgres:
 * - AUTO_INCREMENT for serial columns (not SERIAL)
 * - Backtick identifier quoting
 * - ENGINE=InnoDB on CREATE TABLE
 * - Inline COMMENT support
 * - TINYINT(1) for boolean
 * - LONGTEXT / MEDIUMTEXT / TEXT distinction
 * - No JSONB (JSON only)
 * - DOUBLE instead of DOUBLE PRECISION
 * - BLOB instead of BYTEA
 * - DROP CONSTRAINT → DROP FOREIGN KEY / DROP INDEX
 */
export class MySQLSchemaGrammar implements SchemaGrammar {
  compileCreate(blueprint: Blueprint): CompiledSchema {
    const columnDefs = blueprint.columns.map((col) => this.compileColumn(col));
    const lines: string[] = [...columnDefs];

    for (const idx of blueprint.indexes) {
      if (idx.type === 'primary') {
        const cols = idx.columns.map((c) => this.wrap(c)).join(', ');
        lines.push(`PRIMARY KEY (${cols})`);
      }
    }

    const createTable = `CREATE TABLE ${this.wrap(blueprint.table)} (\n  ${lines.join(',\n  ')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

    const indexes = this.compileStandaloneIndexes(blueprint);
    const foreignKeys = this.compileForeignKeys(blueprint);

    return { createTable, indexes, foreignKeys };
  }

  compileAlter(blueprint: Blueprint): CompiledSchema {
    const alterStatements: string[] = [];
    const table = this.wrap(blueprint.table);

    for (const col of blueprint.columns) {
      alterStatements.push(`ALTER TABLE ${table} ADD COLUMN ${this.compileColumn(col)}`);
    }

    for (const name of blueprint.droppedColumns) {
      alterStatements.push(`ALTER TABLE ${table} DROP COLUMN ${this.wrap(name)}`);
    }

    for (const name of blueprint.droppedIndexes) {
      alterStatements.push(`ALTER TABLE ${table} DROP INDEX ${this.wrap(name)}`);
    }

    for (const name of blueprint.droppedForeignKeys) {
      alterStatements.push(`ALTER TABLE ${table} DROP FOREIGN KEY ${this.wrap(name)}`);
    }

    const indexes = this.compileStandaloneIndexes(blueprint);
    const foreignKeys = this.compileForeignKeys(blueprint);

    return { alterTable: alterStatements, indexes, foreignKeys };
  }

  compileDrop(table: string): string {
    return `DROP TABLE ${this.wrap(table)}`;
  }

  compileDropIfExists(table: string): string {
    return `DROP TABLE IF EXISTS ${this.wrap(table)}`;
  }

  compileTableExists(table: string, schema?: string): string {
    const db = schema ? `'${schema}'` : 'DATABASE()';
    return `SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = ${db}
      AND table_name = '${table}'
    ) AS \`exists\``;
  }

  compileColumnListing(table: string, schema?: string): string {
    const db = schema ? `'${schema}'` : 'DATABASE()';
    return `SELECT column_name FROM information_schema.columns
      WHERE table_schema = ${db} AND table_name = '${table}'
      ORDER BY ordinal_position`;
  }

  // ── Column compilation ────────────────────────────────────────────────────

  protected compileColumn(col: ColumnDefinition): string {
    const isAutoIncrement = col.type === 'bigIncrements' || col.type === 'increments';
    const parts: string[] = [this.wrap(col.name), this.getColumnType(col)];

    if (col.modifiers.unsigned && !isAutoIncrement) {
      parts.push('UNSIGNED');
    }

    // AUTO_INCREMENT types already embed NOT NULL in the type string
    if (!isAutoIncrement) {
      if (!col.modifiers.nullable) {
        parts.push('NOT NULL');
      } else {
        parts.push('NULL');
      }
    }

    if (col.modifiers.hasDefault) {
      parts.push(`DEFAULT ${this.formatDefault(col.modifiers.default)}`);
    }

    if (col.modifiers.unique) {
      parts.push('UNIQUE');
    }

    if (col.modifiers.comment) {
      parts.push(`COMMENT '${col.modifiers.comment.replace(/'/g, "''")}'`);
    }

    return parts.join(' ');
  }

  protected getColumnType(col: ColumnDefinition): string {
    switch (col.type) {
      case 'bigIncrements':
        return 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY';
      case 'increments':
        return 'INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY';
      case 'bigInteger':
        return 'BIGINT';
      case 'integer':
        return 'INT';
      case 'smallInteger':
        return 'SMALLINT';
      case 'tinyInteger':
        return 'TINYINT';
      case 'boolean':
        return 'TINYINT(1)';
      case 'char':
        return `CHAR(${col.length ?? 1})`;
      case 'string':
        return `VARCHAR(${col.length ?? 255})`;
      case 'text':
        return 'TEXT';
      case 'mediumText':
        return 'MEDIUMTEXT';
      case 'longText':
        return 'LONGTEXT';
      case 'float':
        return 'FLOAT';
      case 'double':
        return 'DOUBLE';
      case 'decimal':
        return `DECIMAL(${col.precision ?? 8}, ${col.scale ?? 2})`;
      case 'uuid':
        return 'CHAR(36)';
      case 'ulid':
        return 'CHAR(26)';
      case 'json':
      case 'jsonb':
        return 'JSON';
      case 'timestamp':
      case 'timestampTz':
        return 'TIMESTAMP';
      case 'date':
        return 'DATE';
      case 'time':
        return 'TIME';
      case 'binary':
        return 'BLOB';
      case 'enum':
        if (!col.enumValues || col.enumValues.length === 0) {
          throw new Error(`[orion] Enum column "${col.name}" must have values.`);
        }
        return `ENUM(${col.enumValues.map((v) => `'${v}'`).join(', ')})`;
      default:
        throw new Error(`[orion] Unknown column type: "${col.type}"`);
    }
  }

  protected formatDefault(value: unknown): string {
    if (value === null) return 'NULL';
    if (typeof value === 'boolean') return value ? '1' : '0';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'string') {
      if (value.startsWith('(') && value.endsWith(')')) return value;
      return `'${value.replace(/'/g, "''")}'`;
    }
    return `'${JSON.stringify(value)}'`;
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

  // ── Foreign keys ──────────────────────────────────────────────────────────

  private compileForeignKeys(blueprint: Blueprint): string[] {
    return blueprint.foreignKeys.map((fk) => this.compileForeignKey(blueprint.table, fk));
  }

  private compileForeignKey(table: string, fk: ForeignKeyDefinition): string {
    if (!fk.referencedTable) {
      throw new Error(`[orion] Foreign key on "${table}" must reference a table via .on()`);
    }

    const constraintName =
      fk.constraintName ?? `fk_${table}_${fk.columns.join('_')}_${fk.referencedTable}`;

    const cols = fk.columns.map((c) => this.wrap(c)).join(', ');
    const refCols = fk.referencedColumns.map((c) => this.wrap(c)).join(', ');

    return (
      `ALTER TABLE ${this.wrap(table)} ` +
      `ADD CONSTRAINT ${this.wrap(constraintName)} ` +
      `FOREIGN KEY (${cols}) ` +
      `REFERENCES ${this.wrap(fk.referencedTable)} (${refCols}) ` +
      `ON DELETE ${fk.onDeleteAction} ` +
      `ON UPDATE ${fk.onUpdateAction}`
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private wrap(value: string): string {
    if (value.startsWith('`')) return value;
    if (value.includes('.')) {
      return value
        .split('.')
        .map((p) => `\`${p}\``)
        .join('.');
    }
    return `\`${value}\``;
  }

  private defaultIndexName(table: string, columns: string[], type: string): string {
    return `${table}_${columns.join('_')}_${type}`;
  }
}
