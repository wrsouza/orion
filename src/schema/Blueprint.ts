import { ColumnDefinition } from './ColumnDefinition';
import { ForeignKeyDefinition } from './ForeignKeyDefinition';
import { IndexDefinition } from './IndexDefinition';

/**
 * Fluent API for defining the structure of a database table.
 *
 * An instance is passed to the callback in `Schema.create()` and `Schema.table()`.
 * It collects column definitions, indexes, and foreign key declarations which are
 * then compiled to SQL by the active `SchemaGrammar`.
 *
 * @example
 * ```ts
 * await Schema.create('orders', (table: Blueprint) => {
 *   table.id();
 *   table.foreignId('user_id').references('id').on('users').onDelete('CASCADE');
 *   table.decimal('total', 10, 2);
 *   table.enum('status', ['pending', 'paid', 'shipped']).default('pending');
 *   table.timestamps();
 * });
 * ```
 */
export class Blueprint {
  readonly table: string;
  readonly columns: ColumnDefinition[] = [];
  readonly foreignKeys: ForeignKeyDefinition[] = [];
  readonly indexes: IndexDefinition[] = [];
  droppedColumns: string[] = [];
  droppedIndexes: string[] = [];
  droppedForeignKeys: string[] = [];

  constructor(table: string) {
    this.table = table;
  }

  // ── Primary Keys ──────────────────────────────────────────────────────────

  id(name = 'id'): ColumnDefinition {
    return this.bigIncrements(name);
  }

  increments(name: string): ColumnDefinition {
    const col = new ColumnDefinition(name, 'increments');
    col.modifiers.autoIncrement = true;
    this.columns.push(col);
    return col;
  }

  bigIncrements(name: string): ColumnDefinition {
    const col = new ColumnDefinition(name, 'bigIncrements');
    col.modifiers.autoIncrement = true;
    this.columns.push(col);
    return col;
  }

  // ── Integer Types ─────────────────────────────────────────────────────────

  integer(name: string): ColumnDefinition {
    return this.addColumn(name, 'integer');
  }

  bigInteger(name: string): ColumnDefinition {
    return this.addColumn(name, 'bigInteger');
  }

  smallInteger(name: string): ColumnDefinition {
    return this.addColumn(name, 'smallInteger');
  }

  tinyInteger(name: string): ColumnDefinition {
    return this.addColumn(name, 'tinyInteger');
  }

  unsignedInteger(name: string): ColumnDefinition {
    return this.integer(name).unsigned();
  }

  unsignedBigInteger(name: string): ColumnDefinition {
    return this.bigInteger(name).unsigned();
  }

  // ── String Types ──────────────────────────────────────────────────────────

  char(name: string, length = 1): ColumnDefinition {
    const col = this.addColumn(name, 'char');
    col.length = length;
    return col;
  }

  string(name: string, length = 255): ColumnDefinition {
    const col = this.addColumn(name, 'string');
    col.length = length;
    return col;
  }

  text(name: string): ColumnDefinition {
    return this.addColumn(name, 'text');
  }

  mediumText(name: string): ColumnDefinition {
    return this.addColumn(name, 'mediumText');
  }

  longText(name: string): ColumnDefinition {
    return this.addColumn(name, 'longText');
  }

  // ── Numeric Types ─────────────────────────────────────────────────────────

  float(name: string): ColumnDefinition {
    return this.addColumn(name, 'float');
  }

  double(name: string): ColumnDefinition {
    return this.addColumn(name, 'double');
  }

  decimal(name: string, precision = 8, scale = 2): ColumnDefinition {
    const col = this.addColumn(name, 'decimal');
    col.precision = precision;
    col.scale = scale;
    return col;
  }

  boolean(name: string): ColumnDefinition {
    return this.addColumn(name, 'boolean');
  }

  // ── UUID / ULID ───────────────────────────────────────────────────────────

  uuid(name = 'id'): ColumnDefinition {
    return this.addColumn(name, 'uuid');
  }

  ulid(name = 'id'): ColumnDefinition {
    return this.addColumn(name, 'ulid');
  }

  uuidMorphs(name: string): void {
    this.string(`${name}_type`);
    this.uuid(`${name}_id`);
    this.index([`${name}_type`, `${name}_id`]);
  }

  // ── Date / Time ───────────────────────────────────────────────────────────

  timestamp(name: string): ColumnDefinition {
    return this.addColumn(name, 'timestamp');
  }

  timestampTz(name: string): ColumnDefinition {
    return this.addColumn(name, 'timestampTz');
  }

  timestamps(): void {
    this.timestamp('created_at').nullable();
    this.timestamp('updated_at').nullable();
  }

  timestampsTz(): void {
    this.timestampTz('created_at').nullable();
    this.timestampTz('updated_at').nullable();
  }

  softDeletes(column = 'deleted_at'): ColumnDefinition {
    return this.timestamp(column).nullable();
  }

  softDeletesTz(column = 'deleted_at'): ColumnDefinition {
    return this.timestampTz(column).nullable();
  }

  date(name: string): ColumnDefinition {
    return this.addColumn(name, 'date');
  }

  time(name: string): ColumnDefinition {
    return this.addColumn(name, 'time');
  }

  // ── JSON ──────────────────────────────────────────────────────────────────

  json(name: string): ColumnDefinition {
    return this.addColumn(name, 'json');
  }

  jsonb(name: string): ColumnDefinition {
    return this.addColumn(name, 'jsonb');
  }

  // ── Binary ────────────────────────────────────────────────────────────────

  binary(name: string): ColumnDefinition {
    return this.addColumn(name, 'binary');
  }

  // ── Enum ──────────────────────────────────────────────────────────────────

  enum(name: string, values: string[]): ColumnDefinition {
    const col = this.addColumn(name, 'enum');
    col.enumValues = values;
    return col;
  }

  // ── Indexes ───────────────────────────────────────────────────────────────

  primary(columns: string | string[], name?: string): void {
    this.indexes.push(new IndexDefinition(columns, 'primary', name));
  }

  unique(columns: string | string[], name?: string): void {
    this.indexes.push(new IndexDefinition(columns, 'unique', name));
  }

  index(columns: string | string[], name?: string): void {
    this.indexes.push(new IndexDefinition(columns, 'index', name));
  }

  // ── Foreign Keys ──────────────────────────────────────────────────────────

  foreign(columns: string | string[]): ForeignKeyDefinition {
    const fk = new ForeignKeyDefinition(columns);
    this.foreignKeys.push(fk);
    return fk;
  }

  /**
   * Add an unsigned big integer column AND register a foreign key constraint
   * that can be fully configured via chaining.
   *
   * @example
   * ```ts
   * table.foreignId('user_id').references('id').on('users').onDelete('CASCADE');
   * ```
   */
  foreignId(name: string): ForeignKeyDefinition {
    this.unsignedBigInteger(name);
    const fk = new ForeignKeyDefinition(name);
    this.foreignKeys.push(fk);
    return fk;
  }

  /**
   * Add a UUID column AND register a foreign key constraint
   * that can be fully configured via chaining.
   *
   * @example
   * ```ts
   * table.foreignUuid('user_id').references('id').on('users').onDelete('CASCADE');
   * ```
   */
  foreignUuid(name: string): ForeignKeyDefinition {
    this.uuid(name);
    const fk = new ForeignKeyDefinition(name);
    this.foreignKeys.push(fk);
    return fk;
  }

  // ── Drop helpers (used in alter table) ────────────────────────────────────

  dropColumn(names: string | string[]): void {
    const arr = Array.isArray(names) ? names : [names];
    this.droppedColumns.push(...arr);
  }

  dropIndex(name: string): void {
    this.droppedIndexes.push(name);
  }

  dropForeign(name: string): void {
    this.droppedForeignKeys.push(name);
  }

  dropTimestamps(): void {
    this.dropColumn(['created_at', 'updated_at']);
  }

  dropSoftDeletes(column = 'deleted_at'): void {
    this.dropColumn(column);
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private addColumn(name: string, type: ColumnDefinition['type']): ColumnDefinition {
    const col = new ColumnDefinition(name, type);
    this.columns.push(col);
    return col;
  }
}
