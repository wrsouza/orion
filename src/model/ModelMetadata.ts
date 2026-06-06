import { EventDispatcher } from './events/EventDispatcher';

/**
 * Per-class configuration resolved from decorators.
 * One record exists per Model subclass, keyed by its constructor.
 */
export interface ModelConfig {
  /** Database table name. Defaults to the plural snake_case of the class name. */
  table: string | null;
  /** Primary key column name. */
  primaryKey: string;
  /** Whether the primary key auto-increments. */
  incrementing: boolean;
  /** Primary key type used for casting. */
  keyType: 'number' | 'string';
  /** Whether `created_at` / `updated_at` are managed automatically. */
  timestamps: boolean;
  /** Custom name for the `created_at` column. */
  createdAtColumn: string;
  /** Custom name for the `updated_at` column. */
  updatedAtColumn: string;
  /** Columns allowed for mass assignment. `['*']` means all columns. */
  fillable: string[];
  /** Columns blocked from mass assignment. Takes precedence over `fillable`. */
  guarded: string[];
  /** Named column casts: `{ price: 'number', settings: 'json' }`. */
  casts: Record<string, CastType>;
  /** Columns hidden from serialization. */
  hidden: string[];
  /** Allowlist: if non-empty, only these columns are included (inverse of `hidden`). */
  visible: string[];
  /** Computed accessor names to include automatically in `toArray()` / `toJSON()`. */
  appends: string[];
  /** Named database connection to use for this model. */
  connection: string | null;
  /**
   * Global scopes applied to every query for this model.
   * Keyed by scope name so individual scopes can be removed with `withoutGlobalScope`.
   */
  globalScopes: Map<string, GlobalScopeEntry>;
  /**
   * Local scope methods registered via `@scope` decorator.
   * Key = method name, value = the scope function.
   */
  localScopes: Map<string, LocalScopeMethod>;
  /** Per-class event listener registry. */
  dispatcher: EventDispatcher;
  /**
   * Getter functions registered via `@accessor`.
   * Key = property name, value = the getter function.
   */
  accessors: Map<string, Function>;
  /**
   * Setter functions registered via `@mutator`.
   * Key = property name, value = the setter function.
   */
  mutators: Map<string, Function>;
  /** When `true`, accessor return values are NOT cached per-instance. */
  withoutObjectCaching: boolean;
  /**
   * Dynamically registered relation closures added via `Model.resolveRelationUsing()`.
   * Key = relation name, value = factory closure `(model) => Relation`.
   */
  dynamicRelations: Map<string, (model: any) => any>;
  /** Resource class bound via `@UseResource`. */
  resourceClass: (new (resource: any) => any) | null;
  /** ResourceCollection class bound via `@UseResourceCollection`. */
  resourceCollectionClass: (new (items: any[], resourceClass?: any) => any) | null;
}

/**
 * Primitive cast types supported out of the box.
 *
 * Extended types:
 * - `'decimal:<n>'`        — number stored/returned with `n` decimal places
 * - `'immutable_date'`     — Date that cannot be mutated after creation
 * - `'immutable_datetime'` — alias for `immutable_date`
 * - `'json:unicode'`       — JSON serialized without unicode escaping
 * - `'hashed'`             — one-way SHA-256 hash applied on set
 * - `'AsStringable'`       — wraps the value in a `Stringable` helper
 * - `'encrypted'`          — encrypt/decrypt using the model's cipher (user-provided)
 * - `'encrypted:array'`    — encrypted JSON array
 * - `'encrypted:json'`     — encrypted JSON object
 */
export type PrimitiveCastType =
  | 'number'
  | 'string'
  | 'boolean'
  | 'json'
  | 'date'
  | 'array'
  | `decimal:${number}`
  | 'immutable_date'
  | 'immutable_datetime'
  | 'json:unicode'
  | 'hashed'
  | 'AsStringable'
  | 'encrypted'
  | 'encrypted:array'
  | 'encrypted:json';

/**
 * Interface for class-based custom casts.
 *
 * @example
 * ```ts
 * class MoneyCast implements CastClass {
 *   get(value: unknown): Money  { return new Money(value as number); }
 *   set(value: unknown): unknown { return (value as Money).amount; }
 * }
 *
 * \@casts({ price: MoneyCast })
 * class Product extends Model { declare price: Money; }
 * ```
 */
export interface CastClass {
  /** Transform the raw DB value to the application type. */
  get(value: unknown, params?: string[]): unknown;
  /** Transform the application type back to a raw DB value. */
  set(value: unknown, params?: string[]): unknown;
  /** Return `true` if the cast result should be cached per-instance per-attribute. */
  shouldCache?(): boolean;
}

/**
 * Cast that only transforms on write (`set`), leaving reads as-is.
 * Useful for write-only fields like hashed passwords.
 *
 * @example
 * ```ts
 * class HashCast implements CastsInboundAttributes {
 *   set(value: unknown): unknown { return bcrypt.hashSync(String(value), 10); }
 * }
 * ```
 */
export interface CastsInboundAttributes {
  set(value: unknown, params?: string[]): unknown;
}

/**
 * Constructor type for a class-based cast.
 * Supports parameterised casts: `SomeCast:param1,param2`.
 */
export type CastClassConstructor = new () => CastClass | CastsInboundAttributes;

/**
 * A value-object that provides its own cast class via a static `castUsing()` method.
 *
 * @example
 * ```ts
 * class Money implements Castable {
 *   static castUsing(): CastClassConstructor { return MoneyCast; }
 *   constructor(public amount: number) {}
 * }
 * \@casts({ price: Money })
 * class Product extends Model {}
 * ```
 */
export interface Castable {
  castUsing(params?: string[]): CastClass | CastsInboundAttributes;
}

/** Static side of a `Castable` value object. */
export type CastableConstructor = {
  castUsing(params?: string[]): CastClass | CastsInboundAttributes;
};

/**
 * Cast that can compare two already-cast values for equality.
 * Used by the dirty-checking system to avoid false positives for complex objects.
 *
 * @example
 * ```ts
 * class MoneyCast implements CastClass, ComparesCastableAttributes {
 *   compare(a: unknown, b: unknown): boolean { return (a as Money).amount === (b as Money).amount; }
 *   get(v: unknown) { return new Money(v as number); }
 *   set(v: unknown) { return (v as Money).amount; }
 * }
 * ```
 */
export interface ComparesCastableAttributes {
  compare(a: unknown, b: unknown): boolean;
}

/** All supported cast types: primitive keywords, parameterised strings, or a class constructor. */
export type CastType = PrimitiveCastType | string | CastClassConstructor | CastableConstructor;

/** A class-based global scope implementing `apply()`. */
export interface GlobalScope {
  apply(builder: import('./ModelBuilder').ModelBuilder<any>, model: Function): void;
}

export interface GlobalScopeEntry {
  scope: GlobalScope;
}

/** Function signature for a local scope method on a Model subclass. */
export type LocalScopeMethod = (
  builder: import('./ModelBuilder').ModelBuilder<any>,
  ...args: unknown[]
) => void;

const defaults = (): ModelConfig => ({
  table: null,
  primaryKey: 'id',
  incrementing: true,
  keyType: 'number',
  timestamps: true,
  createdAtColumn: 'created_at',
  updatedAtColumn: 'updated_at',
  fillable: [],
  guarded: ['*'],
  casts: {},
  hidden: [],
  visible: [],
  appends: [],
  connection: null,
  globalScopes: new Map(),
  localScopes: new Map(),
  dispatcher: new EventDispatcher(),
  accessors: new Map(),
  mutators: new Map(),
  withoutObjectCaching: false,
  dynamicRelations: new Map(),
  resourceClass: null,
  resourceCollectionClass: null,
});

/**
 * Central registry mapping every Model constructor to its resolved `ModelConfig`.
 * Decorators call `ModelMetadata.get()` to retrieve and mutate the config for a class.
 */
export class ModelMetadata {
  private static readonly registry = new Map<Function, ModelConfig>();

  /** Global flag set by `Model.preventLazyLoading()`. */
  static preventLazyLoading = false;

  /** Return the config for `target`, creating it with defaults if absent. */
  static get(target: Function): ModelConfig {
    if (!this.registry.has(target)) {
      this.registry.set(target, defaults());
    }
    return this.registry.get(target)!;
  }

  /** Resolve the config for an instance, walking up the prototype chain. */
  static resolve(instance: object): ModelConfig {
    return this.get(instance.constructor);
  }

  /**
   * Merge parent config into child when a subclass has no explicit decorator.
   * Called during `Model` class initialisation.
   */
  static inherit(child: Function, parent: Function): void {
    if (this.registry.has(child)) return;
    const parentConfig = this.get(parent);
    this.registry.set(child, {
      ...parentConfig,
      table: null,
      globalScopes: new Map(parentConfig.globalScopes),
      localScopes: new Map(parentConfig.localScopes),
      dispatcher: new EventDispatcher(),
      accessors: new Map(parentConfig.accessors),
      mutators: new Map(parentConfig.mutators),
      withoutObjectCaching: parentConfig.withoutObjectCaching,
      dynamicRelations: new Map(parentConfig.dynamicRelations),
      resourceClass: parentConfig.resourceClass,
      resourceCollectionClass: parentConfig.resourceCollectionClass,
    });
  }
}
