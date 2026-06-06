import { Blueprint } from '../Blueprint';
import { ColumnDefinition } from '../ColumnDefinition';
import { ForeignKeyDefinition } from '../ForeignKeyDefinition';
import { CompiledSchema, SchemaGrammar } from './SchemaGrammar';

/**
 * Compiles `Blueprint` state into T-SQL (SQL Server) DDL.
 *
 * Key differences vs other grammars:
 * - `IDENTITY(1,1)` instead of AUTO_INCREMENT / SERIAL
 * - `[square bracket]` identifier quoting
 * - `BIT` for boolean
 * - `NVARCHAR(n)` for string/char, `NVARCHAR(MAX)` for text variants
 * - `UNIQUEIDENTIFIER` for uuid/ulid
 * - `VARBINARY(MAX)` for binary
 * - `DATETIME2` for timestamp, `DATETIMEOFFSET` for timestampTz
 * - `NVARCHAR(MAX)` for json/jsonb (no native JSON column type)
 * - `NUMERIC(p,s)` for decimal
 * - `FLOAT` for double/float
 * - No inline FK in CREATE TABLE — always `ALTER TABLE ADD CONSTRAINT`
 * - `DROP INDEX [name] ON [table]` (not just DROP INDEX)
 * - `DROP CONSTRAINT` for FK / unique removal
 * - Column comments not supported inline — omitted silently
 */
export class SQLServerSchemaGrammar implements SchemaGrammar {
  compileCreate(blueprint: Blueprint): CompiledSchema {
    const columnDefs = blueprint.columns.map((col) => this.compileColumn(col));
    const lines: string[] = [...columnDefs];

    for (const idx of blueprint.indexes) {
      if (idx.type === 'primary') {
        const cols = idx.columns.map((c) => this.wrap(c)).join(', ');
        lines.push(`CONSTRAINT ${this.wrap('pk_' + blueprint.table)} PRIMARY KEY (${cols})`);
      }
    }

    const createTable = `CREATE TABLE ${this.wrap(blueprint.table)} (\n  ${lines.join(',\n  ')}\n)`;

    const indexes = this.compileStandaloneIndexes(blueprint);
    // FK as separate ALTER TABLE statements (cannot be inline in SQL Server CREATE TABLE for cross-table refs)
    const foreignKeys = this.compileForeignKeys(blueprint);

    return { createTable, indexes, foreignKeys };
  }

  compileAlter(blueprint: Blueprint): CompiledSchema {
    const alterStatements: string[] = [];
    const table = this.wrap(blueprint.table);

    for (const col of blueprint.columns) {
      alterStatements.push(`ALTER TABLE ${table} ADD ${this.compileColumn(col)}`);
    }

    for (const name of blueprint.droppedColumns) {
      alterStatements.push(`ALTER TABLE ${table} DROP COLUMN ${this.wrap(name)}`);
    }

    for (const name of blueprint.droppedIndexes) {
      // SQL Server: DROP INDEX [name] ON [table]
      alterStatements.push(`DROP INDEX ${this.wrap(name)} ON ${table}`);
    }

    for (const name of blueprint.droppedForeignKeys) {
      alterStatements.push(`ALTER TABLE ${table} DROP CONSTRAINT ${this.wrap(name)}`);
    }

    const indexes = this.compileStandaloneIndexes(blueprint);
    const foreignKeys = this.compileForeignKeys(blueprint);

    return { alterTable: alterStatements, indexes, foreignKeys };
  }

  compileDrop(table: string): string {
    return `DROP TABLE ${this.wrap(table)}`;
  }

  compileDropIfExists(table: string): string {
    return `IF OBJECT_ID(N'${table}', N'U') IS NOT NULL DROP TABLE ${this.wrap(table)}`;
  }

  compileTableExists(table: string, schema = 'dbo'): string {
    return `SELECT CAST(COUNT(*) AS BIT) AS [exists]
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = '${schema}' AND TABLE_NAME = '${table}'`;
  }

  compileColumnListing(table: string, schema = 'dbo'): string {
    return `SELECT COLUMN_NAME AS column_name
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = '${schema}' AND TABLE_NAME = '${table}'
      ORDER BY ORDINAL_POSITION`;
  }

  // ── Column compilation ────────────────────────────────────────────────────

  private compileColumn(col: ColumnDefinition): string {
    const isIdentity = col.type === 'bigIncrements' || col.type === 'increments';
    const parts: string[] = [this.wrap(col.name), this.getColumnType(col)];

    if (!isIdentity) {
      if (!col.modifiers.nullable) {
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

    // Comments are not supported inline in T-SQL — omit silently

    return parts.join(' ');
  }

  private getColumnType(col: ColumnDefinition): string {
    switch (col.type) {
      case 'bigIncrements':
        return 'BIGINT IDENTITY(1,1) PRIMARY KEY NOT NULL';
      case 'increments':
        return 'INT IDENTITY(1,1) PRIMARY KEY NOT NULL';
      case 'bigInteger':
        return col.modifiers.unsigned ? 'BIGINT' : 'BIGINT'; // SQL Server has no UNSIGNED
      case 'integer':
        return 'INT';
      case 'smallInteger':
        return 'SMALLINT';
      case 'tinyInteger':
        return 'TINYINT';
      case 'boolean':
        return 'BIT';
      case 'char':
        return `NCHAR(${col.length ?? 1})`;
      case 'string':
        return `NVARCHAR(${col.length ?? 255})`;
      case 'text':
      case 'mediumText':
      case 'longText':
        return 'NVARCHAR(MAX)';
      case 'float':
        return 'FLOAT(24)'; // single-precision
      case 'double':
        return 'FLOAT(53)'; // double-precision
      case 'decimal':
        return `NUMERIC(${col.precision ?? 8}, ${col.scale ?? 2})`;
      case 'uuid':
      case 'ulid':
        return 'UNIQUEIDENTIFIER';
      case 'json':
      case 'jsonb':
        return 'NVARCHAR(MAX)'; // JSON stored as text; use JSON_VALUE / JSON_QUERY
      case 'timestamp':
        return 'DATETIME2';
      case 'timestampTz':
        return 'DATETIMEOFFSET';
      case 'date':
        return 'DATE';
      case 'time':
        return 'TIME';
      case 'binary':
        return 'VARBINARY(MAX)';
      case 'enum':
        if (!col.enumValues || col.enumValues.length === 0) {
          throw new Error(`[orion] Enum column "${col.name}" must have values.`);
        }
        // SQL Server: NVARCHAR + CHECK constraint
        return `NVARCHAR(255) CHECK (${this.wrap(col.name)} IN (${col.enumValues
          .map((v) => `N'${v}'`)
          .join(', ')}))`;
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
      return `N'${value.replace(/'/g, "''")}'`;
    }
    return `N'${JSON.stringify(value)}'`;
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
    if (value.startsWith('[') && value.endsWith(']')) return value;
    if (value.includes('.')) {
      return value
        .split('.')
        .map((p) => `[${p}]`)
        .join('.');
    }
    return `[${value.replace(/]/g, ']]')}]`;
  }

  private defaultIndexName(table: string, columns: string[], type: string): string {
    return `${table}_${columns.join('_')}_${type}`;
  }
}
