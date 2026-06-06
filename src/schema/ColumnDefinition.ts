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

  comment(text: string): this {
    this.modifiers.comment = text;
    return this;
  }
}
