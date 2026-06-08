export type ColumnType =
  | 'bigIncrements'
  | 'increments'
  | 'bigInteger'
  | 'integer'
  | 'smallInteger'
  | 'tinyInteger'
  | 'boolean'
  | 'char'
  | 'string'
  | 'text'
  | 'mediumText'
  | 'longText'
  | 'float'
  | 'double'
  | 'decimal'
  | 'uuid'
  | 'ulid'
  | 'json'
  | 'jsonb'
  | 'timestamp'
  | 'timestampTz'
  | 'date'
  | 'time'
  | 'binary'
  | 'enum';

export interface ColumnModifiers {
  nullable: boolean;
  default: unknown;
  hasDefault: boolean;
  unique: boolean;
  index: boolean;
  unsigned: boolean;
  comment: string | null;
  after: string | null;
  first: boolean;
  autoIncrement: boolean;
  /** When true, the column is emitted with an inline PRIMARY KEY constraint. */
  primary: boolean;
}

export class ColumnDefinition {
  readonly name: string;
  readonly type: ColumnType;
  length?: number;
  precision?: number;
  scale?: number;
  enumValues?: string[];

  modifiers: ColumnModifiers = {
    nullable: false,
    default: undefined,
    hasDefault: false,
    unique: false,
    index: false,
    unsigned: false,
    comment: null,
    after: null,
    first: false,
    autoIncrement: false,
    primary: false,
  };

  constructor(name: string, type: ColumnType) {
    this.name = name;
    this.type = type;
  }

  nullable(): this {
    this.modifiers.nullable = true;
    return this;
  }

  default(value: unknown): this {
    this.modifiers.default = value;
    this.modifiers.hasDefault = true;
    return this;
  }

  unique(): this {
    this.modifiers.unique = true;
    return this;
  }

  index(): this {
    this.modifiers.index = true;
    return this;
  }

  unsigned(): this {
    this.modifiers.unsigned = true;
    return this;
  }

  /**
   * Mark this column as the table's primary key.
   * Emits an inline `PRIMARY KEY` constraint in the generated DDL.
   *
   * @example
   * ```ts
   * table.uuid('id').primary()
   * table.string('slug', 100).primary()
   * ```
   */
  primary(): this {
    this.modifiers.primary = true;
    return this;
  }

  comment(text: string): this {
    this.modifiers.comment = text;
    return this;
  }
}
