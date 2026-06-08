import { Blueprint } from '../Blueprint';
import { ColumnDefinition } from '../ColumnDefinition';
import { ForeignKeyDefinition } from '../ForeignKeyDefinition';
import { CompiledSchema, SchemaGrammar } from './SchemaGrammar';

export class PostgresSchemaGrammar implements SchemaGrammar {
  compileCreate(blueprint: Blueprint): CompiledSchema {
    const columnDefs = blueprint.columns.map((col) => this.compileColumn(col));
    const _inlinePrimary = blueprint.columns.find((c) => c.modifiers.autoIncrement);

    const lines: string[] = [...columnDefs];

    // Inline indexes defined on the blueprint (primary, unique)
    for (const idx of blueprint.indexes) {
      if (idx.type === 'primary') {
        const cols = idx.columns.map((c) => this.wrap(c)).join(', ');
        lines.push(`PRIMARY KEY (${cols})`);
      }
    }

    const createTable = `CREATE TABLE ${this.wrap(blueprint.table)} (\n  ${lines.join(',\n  ')}\n)`;

    const indexes = this.compileStandaloneIndexes(blueprint);
    const foreignKeys = this.compileForeignKeys(blueprint);

    return { createTable, indexes, foreignKeys };
  }

  compileAlter(blueprint: Blueprint): CompiledSchema {
    const alterStatements: string[] = [];
    const table = this.wrap(blueprint.table);

    // Add columns
    for (const col of blueprint.columns) {
      alterStatements.push(`ALTER TABLE ${table} ADD COLUMN ${this.compileColumn(col)}`);
    }

    // Drop columns
    for (const name of blueprint.droppedColumns) {
      alterStatements.push(`ALTER TABLE ${table} DROP COLUMN ${this.wrap(name)}`);
    }

    // Drop indexes
    for (const name of blueprint.droppedIndexes) {
      alterStatements.push(`DROP INDEX IF EXISTS ${this.wrap(name)}`);
    }

    // Drop foreign keys
    for (const name of blueprint.droppedForeignKeys) {
      alterStatements.push(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${this.wrap(name)}`);
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

  compileTableExists(table: string, schema = 'public'): string {
    return `SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = '${schema}'
      AND table_name = '${table}'
    ) AS "exists"`;
  }

  compileColumnListing(table: string, schema = 'public'): string {
    return `SELECT column_name FROM information_schema.columns
      WHERE table_schema = '${schema}' AND table_name = '${table}'
      ORDER BY ordinal_position`;
  }

  // ── Column compilation ────────────────────────────────────────────────────

  private compileColumn(col: ColumnDefinition): string {
    const parts: string[] = [this.wrap(col.name), this.getColumnType(col)];

    if (col.modifiers.primary) {
      // PRIMARY KEY implies NOT NULL — no need to repeat it
      parts.push('PRIMARY KEY');
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

    if (col.modifiers.comment) {
      // Comments in Postgres are separate statements; we skip inline here
    }

    return parts.join(' ');
  }

  private getColumnType(col: ColumnDefinition): string {
    switch (col.type) {
      case 'bigIncrements':
        return 'BIGSERIAL PRIMARY KEY';
      case 'increments':
        return 'SERIAL PRIMARY KEY';
      case 'bigInteger':
        return col.modifiers.unsigned ? 'BIGINT CHECK (value >= 0)' : 'BIGINT';
      case 'integer':
        return col.modifiers.unsigned ? 'INTEGER CHECK (value >= 0)' : 'INTEGER';
      case 'smallInteger':
        return 'SMALLINT';
      case 'tinyInteger':
        return 'SMALLINT';
      case 'boolean':
        return 'BOOLEAN';
      case 'char':
        return `CHAR(${col.length ?? 1})`;
      case 'string':
        return `VARCHAR(${col.length ?? 255})`;
      case 'text':
      case 'mediumText':
      case 'longText':
        return 'TEXT';
      case 'float':
        return 'REAL';
      case 'double':
        return 'DOUBLE PRECISION';
      case 'decimal':
        return `DECIMAL(${col.precision ?? 8}, ${col.scale ?? 2})`;
      case 'uuid':
        return 'UUID';
      case 'ulid':
        return 'CHAR(26)';
      case 'json':
        return 'JSON';
      case 'jsonb':
        return 'JSONB';
      case 'timestamp':
        return 'TIMESTAMP';
      case 'timestampTz':
        return 'TIMESTAMPTZ';
      case 'date':
        return 'DATE';
      case 'time':
        return 'TIME';
      case 'binary':
        return 'BYTEA';
      case 'enum':
        if (!col.enumValues || col.enumValues.length === 0) {
          throw new Error(`[orion] Enum column "${col.name}" must have values.`);
        }
        return `VARCHAR(255) CHECK (${this.wrap(col.name)} IN (${col.enumValues
          .map((v) => `'${v}'`)
          .join(', ')}))`;
      default:
        throw new Error(`[orion] Unknown column type: "${col.type}"`);
    }
  }

  private formatDefault(value: unknown): string {
    if (value === null) return 'NULL';
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'string') {
      // Raw SQL expressions (wrapped in parentheses) are passed through
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
      if (idx.type === 'primary') continue; // handled inline for CREATE TABLE

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

    // Also create indexes for columns flagged with .index()
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
    // Already quoted
    if (value.startsWith('"')) return value;
    // Schema-qualified: schema.table
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
