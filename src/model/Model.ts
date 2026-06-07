import { ConnectionManager } from '../connection/ConnectionManager';
import { Collection } from './Collection';
import { ModelBuilder, ModelConstructor } from './ModelBuilder';
import { CastType, ModelMetadata } from './ModelMetadata';
import { HasOne } from './relations/HasOne';
import { HasMany } from './relations/HasMany';
import { BelongsTo } from './relations/BelongsTo';
import { BelongsToMany } from './relations/BelongsToMany';
import { ModelEvent, ModelListener } from './events/ModelEvents';
import { withoutEvents } from './events/EventDispatcher';
import { Observer } from './events/Observer';
import { registerObserver } from './decorators/observe';
import { HasOneThrough } from './relations/HasOneThrough';
import { HasManyThrough } from './relations/HasManyThrough';
import { MorphOne } from './relations/MorphOne';
import { MorphMany } from './relations/MorphMany';
import { MorphTo } from './relations/MorphTo';
import { MorphToMany } from './relations/MorphToMany';
import { MorphedByMany } from './relations/MorphedByMany';
import type { EagerConstraint } from './EagerLoader';

// ── Utility types ─────────────────────────────────────────────────────────

type ModelSubclass<T extends Model> = {
  new (): T;
  [key: string]: unknown;
} & typeof Model;

// ── Proxy handler for dirty tracking ─────────────────────────────────────

function makeProxy<T extends Model>(instance: T): T {
  return new Proxy(instance, {
    get(target, prop: string, receiver: any) {
      // Pass the proxy as receiver so user-defined getters (e.g. accessors)
      // receive the proxied instance as `this`, enabling transparent attribute reads.
      const val = Reflect.get(target, prop, receiver);
      // Let methods / symbol accessors pass through normally
      if (typeof val === 'function' || typeof prop === 'symbol') return val;
      // Dynamic relation registered via resolveRelationUsing
      const dynRelations = ModelMetadata.get(target.constructor as Function).dynamicRelations;
      if (dynRelations.has(prop)) {
        const closure = dynRelations.get(prop)!;
        // Return a function so usage is `model.latestOrder()` (consistent with real relations)
        return () => closure(receiver);
      }
      // Attribute read — apply cast if configured
      if (prop in target._attributes) {
        return target._castGet(prop, target._attributes[prop]);
      }
      return val;
    },
    set(target, prop: string, value, receiver: any) {
      if (typeof prop === 'symbol' || prop.startsWith('_')) {
        return Reflect.set(target, prop, value);
      }
      // Model instance properties (not DB columns) — bypass _attributes
      if (prop === 'exists' || prop === 'wasRecentlyCreated') {
        return Reflect.set(target, prop, value);
      }
      // Check for a registered @mutator setter — it takes full responsibility
      // for writing the transformed value into _attributes.
      const cfg = ModelMetadata.get(target.constructor as Function);
      if (cfg.mutators.has(prop)) {
        cfg.mutators.get(prop)!.call(receiver, value);
        return true;
      }
      // For class-based casts, transform the value before storing.
      target._attributes[prop] = target._castSet(prop, value);
      return true;
    },
  });
}

/**
 * Base class for every model in orion.
 *
 * Implements the Active Record pattern: each instance represents a single
 * database row and knows how to read, write, and track its own state.
 *
 * ## Quick start
 *
 * ```ts
 * \@table('users')
 * \@fillable(['name', 'email'])
 * \@hidden(['password'])
 * class User extends Model {
 *   declare name: string;
 *   declare email: string;
 *   declare password: string;
 * }
 *
 * // Static query API
 * const user  = await User.find(1);
 * const users = await User.where('active', true).orderBy('name').get();
 * const alice = await User.create({ name: 'Alice', email: 'a@example.com' });
 *
 * // Instance API
 * alice.name = 'Alice B.';
 * await alice.save();
 * await alice.delete();
 * ```
 */
export class Model {
  // ── Internal state ────────────────────────────────────────────────────────

  /** Raw attribute values from/for the database. */
  _attributes: Record<string, unknown> = {};
  /** Snapshot taken when the model was last hydrated or saved. */
  private _original: Record<string, unknown> = {};
  /** Changes recorded since the last save (populated after save). */
  private _changes: Record<string, unknown> = {};
  /** Snapshot of `_attributes` taken right before the last save (for `getPrevious()`). */
  private _previous: Record<string, unknown> = {};
  /** Loaded relationship results, keyed by relation name. */
  _relations: Record<string, unknown> = {};

  /** `true` when this instance reflects a persisted database row. */
  exists = false;
  /** `true` when this instance was just inserted by `create()`. */
  wasRecentlyCreated = false;

  // ── Defaults ──────────────────────────────────────────────────────────────
  /** Default attribute values applied when a new instance is created. */
  protected _defaults: Record<string, unknown> = {};

  // ── Touch ─────────────────────────────────────────────────────────────────
  /**
   * Relation names whose parent's `updated_at` should be touched after every save.
   * @example `protected _touches = ['post'];`
   */
  protected _touches: string[] = [];

  // ── Per-instance cast overrides ───────────────────────────────────────────
  /** Cast overrides applied via `ModelBuilder.withCasts()` at query time. */
  _instanceCasts: Record<string, CastType> | null = null;

  // ── Accessor result cache ─────────────────────────────────────────────────
  /** Per-instance cache for accessor results from cacheable `CastClass` casts. */
  private _accessorCache: Record<string, unknown> = {};

  // ── Per-instance serialization overrides (null = use class defaults) ───────
  /** Extra columns made visible for this instance (overrides `@hidden`). */
  private _instanceVisible: string[] | null = null;
  /** Extra columns hidden for this instance (stacked on top of `@hidden`). */
  private _instanceHidden: string[] | null = null;
  /** Appended accessor names for this instance (overrides `@appends`). */
  private _instanceAppends: string[] | null = null;

  // ── Constructor ───────────────────────────────────────────────────────────

  constructor() {
    // Proxy is applied by static `new` and `hydrate` — not here,
    // so that internal initialisers run without interception.
  }

  // ── Metadata helpers ──────────────────────────────────────────────────────

  private static config() {
    return ModelMetadata.get(this);
  }

  /** When `true`, timestamps are NOT written on the next save (reset after use). */
  private static _skipTimestamps = false;

  /** When `true`, assigning a non-fillable attribute throws instead of silently discarding. */
  private static _strictMassAssign = false;

  /**
   * Optional encryption cipher used by `'encrypted'` / `'encrypted:array'` / `'encrypted:json'` casts.
   * Assign a `CipherContract` implementation to enable encryption.
   *
   * @example
   * ```ts
   * import { Model, CipherContract } from 'orion';
   * Model._cipher = {
   *   encrypt: (v) => Buffer.from(v).toString('base64'),
   *   decrypt: (v) => Buffer.from(v, 'base64').toString(),
   * };
   * ```
   */
  static _cipher: import('./Model').CipherContract | undefined = undefined;

  /**
   * Enable or disable the lazy loading guard globally.
   * When enabled, calling `getResults()` on any relation throws a
   * `LazyLoadingViolationError` — useful in tests to catch N+1 bugs.
   *
   * @example
   * ```ts
   * Model.preventLazyLoading();           // enable
   * Model.preventLazyLoading(false);      // disable
   * Model.preventLazyLoading(process.env.NODE_ENV !== 'production');
   * ```
   */
  static preventLazyLoading(enable = true): void {
    ModelMetadata.preventLazyLoading = enable;
  }

  /**
   * Register a relation closure under `name` at runtime, without modifying the class.
   * The closure receives the model instance and must return a `Relation` object.
   *
   * Useful for plugins, mixins, or cross-cutting concerns that need to attach
   * relations to models they don't own.
   *
   * @example
   * ```ts
   * User.resolveRelationUsing('latestOrder', (user) =>
   *   user.hasOne(Order).latest()
   * );
   *
   * const order = await user.latestOrder().getResults();
   * ```
   */
  static resolveRelationUsing<T extends Model>(
    this: ModelSubclass<T>,
    name: string,
    closure: (model: T) => import('./relations/Relation').Relation<any>
  ): void {
    ModelMetadata.get(this).dynamicRelations.set(name, closure as (model: any) => any);
  }

  /**
   * Run `callback` with automatic timestamp management disabled.
   * `created_at` and `updated_at` are NOT touched for any save inside the closure.
   *
   * @example
   * ```ts
   * await User.withoutTimestamps(() => user.save());
   * ```
   */
  static async withoutTimestamps<R>(callback: () => R | Promise<R>): Promise<R> {
    Model._skipTimestamps = true;
    try {
      return await callback();
    } finally {
      Model._skipTimestamps = false;
    }
  }

  /**
   * Enable strict mass-assignment mode.
   * When enabled, assigning a non-fillable attribute via `fill()` throws a `MassAssignmentError`
   * instead of silently discarding the value.
   *
   * @example
   * ```ts
   * Model.preventSilentlyDiscardingAttributes();           // enable
   * Model.preventSilentlyDiscardingAttributes(false);      // disable
   * ```
   */
  static preventSilentlyDiscardingAttributes(enable = true): void {
    Model._strictMassAssign = enable;
  }

  /** Resolved table name (decorator override → plural snake_case of class name). */
  static getTable(): string {
    const cfg = this.config();
    return cfg.table ?? toSnakePlural(this.name);
  }

  /** Primary key column name. */
  static getPrimaryKey(): string {
    return this.config().primaryKey;
  }

  // ── Builder factory ───────────────────────────────────────────────────────

  /**
   * Return a `ModelBuilder` scoped to this model class.
   * All static query methods delegate here.
   *
   * The returned builder is wrapped in a `Proxy` so that any method name not
   * found on `ModelBuilder` is looked up in the model's registered local scopes
   * (decorated with `@scope`). This enables fluent scope chaining:
   *
   * ```ts
   * await User.query().popular().active().get();
   * ```
   */
  static query<T extends Model>(this: ModelSubclass<T>): ModelBuilder<T> {
    const cfg = ModelMetadata.get(this);
    const connName = cfg.connection ?? undefined;
    const connection = ConnectionManager.getConnection(connName);
    const builder = new ModelBuilder<T>(
      this as unknown as ModelConstructor<T>,
      connection,
      connection.getGrammar()
    );

    return new Proxy(builder, {
      get(target, prop: string | symbol) {
        if (typeof prop === 'symbol' || prop in target) {
          return Reflect.get(target, prop);
        }
        const scopeFn = cfg.localScopes.get(prop);
        if (scopeFn) {
          return (...args: unknown[]) => {
            scopeFn(target, ...args);
            return target; // allow chaining
          };
        }
        return undefined;
      },
    });
  }

  // ── Static query API ──────────────────────────────────────────────────────

  /** Return all rows as a `Collection<T>`. */
  static async all<T extends Model>(this: ModelSubclass<T>): Promise<Collection<T>> {
    return this.query<T>().get();
  }

  /** Start a WHERE clause. Supports equality shorthand and explicit operator. */
  static where<T extends Model>(
    this: ModelSubclass<T>,
    column: string,
    operatorOrValue: unknown,
    value?: unknown
  ): ModelBuilder<T> {
    return value !== undefined
      ? this.query<T>().where(column, operatorOrValue, value)
      : this.query<T>().where(column, operatorOrValue);
  }

  /** `WHERE column IN (values)` */
  static whereIn<T extends Model>(
    this: ModelSubclass<T>,
    column: string,
    values: unknown[]
  ): ModelBuilder<T> {
    return this.query<T>().whereIn(column, values);
  }

  /** `WHERE column IS NULL` */
  static whereNull<T extends Model>(this: ModelSubclass<T>, column: string): ModelBuilder<T> {
    return this.query<T>().whereNull(column);
  }

  /** `WHERE column IS NOT NULL` */
  static whereNotNull<T extends Model>(this: ModelSubclass<T>, column: string): ModelBuilder<T> {
    return this.query<T>().whereNotNull(column);
  }

  /** Find a model by primary key, or `null`. */
  static async find<T extends Model>(this: ModelSubclass<T>, id: unknown): Promise<T | null> {
    return this.query<T>().find(id);
  }

  /** Find by primary key or throw `Error`. */
  static async findOrFail<T extends Model>(this: ModelSubclass<T>, id: unknown): Promise<T> {
    return this.query<T>().findOrFail(id);
  }

  /**
   * Find by primary key, or execute `callback` if not found.
   * The callback's return value is returned as-is.
   */
  static async findOr<T extends Model, U>(
    this: ModelSubclass<T>,
    id: unknown,
    callback: () => U | Promise<U>
  ): Promise<T | U> {
    return this.query<T>().findOr(id, callback);
  }

  /**
   * Return the first result, or execute `callback` if no rows match.
   * The callback return value is returned as-is.
   */
  static async firstOr<T extends Model, U>(
    this: ModelSubclass<T>,
    callback: () => U | Promise<U>
  ): Promise<T | U> {
    return this.query<T>().firstOr(callback);
  }

  /** Return the first row matching the given column / value pair. */
  static async firstWhere<T extends Model>(
    this: ModelSubclass<T>,
    column: string,
    value: unknown
  ): Promise<T | null> {
    return this.query<T>().where(column, value).first();
  }

  /**
   * Find the first row matching `attributes`, or create it.
   * `extra` is merged in only when creating.
   */
  static async firstOrCreate<T extends Model>(
    this: ModelSubclass<T>,
    attributes: Record<string, unknown>,
    extra: Record<string, unknown> = {}
  ): Promise<T> {
    let instance = await this.query<T>()
      .where((q) => {
        for (const [k, v] of Object.entries(attributes)) q.where(k, v);
      })
      .first();

    if (!instance) {
      instance = await this.create<T>({ ...attributes, ...extra });
    }

    return instance;
  }

  /**
   * Find the first row matching `attributes`, or return a new (unsaved) instance.
   */
  static async firstOrNew<T extends Model>(
    this: ModelSubclass<T>,
    attributes: Record<string, unknown>,
    extra: Record<string, unknown> = {}
  ): Promise<T> {
    const instance = await this.query<T>()
      .where((q) => {
        for (const [k, v] of Object.entries(attributes)) q.where(k, v);
      })
      .first();

    return instance ?? this.newInstance<T>({ ...attributes, ...extra });
  }

  /**
   * Update a matching row or create it if none exists.
   */
  static async updateOrCreate<T extends Model>(
    this: ModelSubclass<T>,
    attributes: Record<string, unknown>,
    values: Record<string, unknown> = {}
  ): Promise<T> {
    let instance = await this.query<T>()
      .where((q) => {
        for (const [k, v] of Object.entries(attributes)) q.where(k, v);
      })
      .first();

    if (instance) {
      await (instance as Model).update(values);
    } else {
      instance = await this.create<T>({ ...attributes, ...values });
      (instance as Model).wasRecentlyCreated = true;
    }

    return instance;
  }

  /**
   * Insert a new row and return the hydrated model.
   */
  static async create<T extends Model>(
    this: ModelSubclass<T>,
    attributes: Record<string, unknown>
  ): Promise<T> {
    const instance = this.newInstance<T>(attributes);
    await (instance as Model).save();
    (instance as Model).wasRecentlyCreated = true;
    return instance;
  }

  /**
   * Return the Factory associated with this model class.
   * Requires a factory class registered via `Model.useFactory()` or the
   * `_factory` static property on the subclass.
   *
   * ```ts
   * const user = await User.factory().create();
   * const users = await User.factory().count(5).state({ active: true }).create();
   * ```
   */
  static factory<T extends Model>(this: ModelSubclass<T>): import('../factory/Factory').Factory<T> {
    const factoryCtor = (this as any)._factory as
      | (new () => import('../factory/Factory').Factory<T>)
      | undefined;
    if (!factoryCtor) {
      throw new Error(
        `No factory registered for [${this.name}]. ` +
          `Set a static \`_factory\` property on the model class pointing to a Factory subclass.`
      );
    }
    return new factoryCtor();
  }

  /**
   * Delete one or more rows by primary key without loading models.
   * @returns Number of rows deleted.
   */
  static async destroy<T extends Model>(
    this: ModelSubclass<T>,
    ...ids: unknown[]
  ): Promise<number> {
    const flat = ids.flat();
    return this.query<T>().whereIn(this.getPrimaryKey(), flat).delete();
  }

  /**
   * Bulk-delete rows by primary key, loading each model first so events fire.
   * For models with the `SoftDeletes` mixin, use `forceDestroy` to hard-delete.
   */
  static async destroyAndFire<T extends Model>(
    this: ModelSubclass<T>,
    ...ids: unknown[]
  ): Promise<number> {
    const flat = ids.flat();
    const models = await this.query<T>().whereIn(this.getPrimaryKey(), flat).get();
    let count = 0;
    for (const model of models) {
      if (await (model as Model).delete()) count++;
    }
    return count;
  }

  /**
   * Force-delete (skip soft-delete) rows by primary key, loading each model so events fire.
   * No-op for models without the `SoftDeletes` mixin — delegates to `destroyAndFire`.
   */
  static async forceDestroy<T extends Model>(
    this: ModelSubclass<T>,
    ...ids: unknown[]
  ): Promise<number> {
    const flat = ids.flat();
    const models = await this.query<T>().whereIn(this.getPrimaryKey(), flat).get();
    let count = 0;
    for (const model of models) {
      const m = model as any;
      if (typeof m.forceDelete === 'function') {
        if (await m.forceDelete()) count++;
      } else {
        if (await (model as Model).delete()) count++;
      }
    }
    return count;
  }

  /**
   * Remove all rows from the table and reset sequences.
   * **This cannot be rolled back.**
   */
  static async truncate<T extends Model>(this: ModelSubclass<T>): Promise<void> {
    return this.query<T>().truncate();
  }

  // ── Scope helpers ─────────────────────────────────────────────────────────

  /**
   * Start a query excluding the named global scope.
   *
   * @example
   * ```ts
   * await User.withoutGlobalScope('ActiveScope').get();
   * ```
   */
  static withoutGlobalScope<T extends Model>(
    this: ModelSubclass<T>,
    name: string
  ): ModelBuilder<T> {
    return this.query<T>().withoutGlobalScope(name);
  }

  /**
   * Start a query with all (or specific) global scopes removed.
   */
  static withoutGlobalScopes<T extends Model>(
    this: ModelSubclass<T>,
    names?: string[]
  ): ModelBuilder<T> {
    return this.query<T>().withoutGlobalScopes(names);
  }

  /**
   * Start a query that includes soft-deleted rows.
   * Only meaningful when the model uses the `SoftDeletes` mixin.
   *
   * @example
   * ```ts
   * const allPosts = await Post.withTrashed().get();
   * ```
   */
  static withTrashed<T extends Model>(this: ModelSubclass<T>): ModelBuilder<T> {
    return this.query<T>().withTrashed();
  }

  /**
   * Start a query that returns only soft-deleted rows.
   *
   * @example
   * ```ts
   * const deleted = await Post.onlyTrashed().get();
   * ```
   */
  static onlyTrashed<T extends Model>(this: ModelSubclass<T>): ModelBuilder<T> {
    return this.query<T>().onlyTrashed();
  }

  // ── Events ───────────────────────────────────────────────────────────────

  /**
   * Register a listener for a model lifecycle event on this class.
   * Return `false` from a `-ing` listener to cancel the operation.
   *
   * @example
   * ```ts
   * User.saving((user) => {
   *   user.slug = slugify(user.name);
   * });
   * User.deleting((user) => {
   *   if (user.is_admin) return false; // cancel delete
   * });
   * ```
   */
  static on<T extends Model>(
    this: ModelSubclass<T>,
    event: ModelEvent,
    listener: ModelListener<T>
  ): void {
    ModelMetadata.get(this).dispatcher.on(event, listener as ModelListener);
  }

  /** Shorthand: `Model.retrieved(cb)` */
  static retrieved<T extends Model>(this: ModelSubclass<T>, cb: ModelListener<T>): void {
    this.on('retrieved', cb);
  }
  /** Shorthand: `Model.creating(cb)` — return `false` to cancel. */
  static creating<T extends Model>(this: ModelSubclass<T>, cb: ModelListener<T>): void {
    this.on('creating', cb);
  }
  /** Shorthand: `Model.created(cb)` */
  static created<T extends Model>(this: ModelSubclass<T>, cb: ModelListener<T>): void {
    this.on('created', cb);
  }
  /** Shorthand: `Model.updating(cb)` — return `false` to cancel. */
  static updating<T extends Model>(this: ModelSubclass<T>, cb: ModelListener<T>): void {
    this.on('updating', cb);
  }
  /** Shorthand: `Model.updated(cb)` */
  static updated<T extends Model>(this: ModelSubclass<T>, cb: ModelListener<T>): void {
    this.on('updated', cb);
  }
  /** Shorthand: `Model.saving(cb)` — return `false` to cancel. */
  static saving<T extends Model>(this: ModelSubclass<T>, cb: ModelListener<T>): void {
    this.on('saving', cb);
  }
  /** Shorthand: `Model.saved(cb)` */
  static saved<T extends Model>(this: ModelSubclass<T>, cb: ModelListener<T>): void {
    this.on('saved', cb);
  }
  /** Shorthand: `Model.deleting(cb)` — return `false` to cancel. */
  static deleting<T extends Model>(this: ModelSubclass<T>, cb: ModelListener<T>): void {
    this.on('deleting', cb);
  }
  /** Shorthand: `Model.deleted(cb)` */
  static deleted<T extends Model>(this: ModelSubclass<T>, cb: ModelListener<T>): void {
    this.on('deleted', cb);
  }

  /**
   * Register an observer object on this model class.
   * Each method whose name matches a lifecycle event is registered as a listener.
   *
   * @example
   * ```ts
   * User.observe(new UserObserver());
   * ```
   */
  static observe<T extends Model>(this: ModelSubclass<T>, observer: Observer<T>): void {
    registerObserver(ModelMetadata.get(this).dispatcher, observer as Observer);
  }

  /**
   * Run `callback` with all events suppressed for this and every other model.
   * Returns whatever the callback returns.
   *
   * @example
   * ```ts
   * await User.withoutEvents(async () => {
   *   await user.save();
   * });
   * ```
   */
  static async withoutEvents<R>(callback: () => R | Promise<R>): Promise<R> {
    return withoutEvents(callback);
  }

  // ── Hydration ─────────────────────────────────────────────────────────────

  /**
   * Create a fully initialised model instance from a raw database row.
   * This is the only place where `exists` is set to `true`.
   */
  static hydrate<T extends Model>(this: ModelSubclass<T>, row: Record<string, unknown>): T {
    const instance = new this() as Model;
    instance._attributes = { ...row };
    instance._original = { ...row };
    instance._changes = {};
    instance._relations = {};
    instance.exists = true;
    const proxy = makeProxy(instance) as T;
    ModelMetadata.get(this).dispatcher.fireSync('retrieved', proxy);
    return proxy;
  }

  /**
   * Return a new unsaved instance populated with `attributes`.
   * Mass assignment rules are NOT applied here — use `fill()` for that.
   */
  static newInstance<T extends Model>(
    this: ModelSubclass<T>,
    attributes: Record<string, unknown> = {}
  ): T {
    const instance = new this() as Model;
    instance._attributes = { ...instance._defaults, ...attributes };
    instance._original = {};
    return makeProxy(instance) as T;
  }

  // ── Instance CRUD ─────────────────────────────────────────────────────────

  /**
   * Persist the model: INSERT when new, UPDATE when already saved.
   * Timestamps are set automatically if enabled.
   * Fires `saving` → (`creating`|`updating`) → DB → (`created`|`updated`) → `saved`.
   * Return `false` from any `-ing` listener to abort and return `false`.
   */
  async save(): Promise<boolean> {
    const cfg = ModelMetadata.resolve(this);
    const dispatcher = ModelMetadata.get(this.constructor as Function).dispatcher;
    const builder = this._newQueryBuilder();

    this._previous = { ...this._attributes };

    if (!(await dispatcher.fire('saving', this))) return false;

    if (cfg.timestamps && !Model._skipTimestamps) {
      const now = new Date();
      if (!this.exists) {
        this._attributes[cfg.createdAtColumn] = now;
      }
      this._attributes[cfg.updatedAtColumn] = now;
    }

    if (this.exists) {
      const dirty = this._getDirtyAttributes();
      if (Object.keys(dirty).length === 0) {
        await dispatcher.fire('saved', this);
        return true;
      }

      if (!(await dispatcher.fire('updating', this))) return false;

      await builder.where(cfg.primaryKey, this._attributes[cfg.primaryKey]).update(dirty);
      this._syncChanges();
      this._syncOriginal();

      await dispatcher.fire('updated', this);
    } else {
      if (!(await dispatcher.fire('creating', this))) return false;

      // HasUuids / HasUlids: populate UUID/ULID columns before insert
      if (typeof (this as any)._applyUniqueIds === 'function') {
        (this as any)._applyUniqueIds();
      }

      const id = await builder.insertGetId(this._attributes);
      if (cfg.incrementing) {
        this._attributes[cfg.primaryKey] = id;
      }
      this.exists = true;
      this._syncOriginal();

      await dispatcher.fire('created', this);
    }

    await dispatcher.fire('saved', this);

    if (this._touches.length > 0) {
      await this._touchOwners();
    }

    return true;
  }

  /**
   * Save the model without firing any events.
   */
  async saveQuietly(): Promise<boolean> {
    return withoutEvents(() => this.save());
  }

  /**
   * Save inside a transaction, rolling back and throwing if the save is cancelled
   * by an event listener or any error occurs.
   */
  async saveOrFail(): Promise<void> {
    const connection = ConnectionManager.getConnection(
      ModelMetadata.resolve(this).connection ?? undefined
    );
    await connection.transaction(async () => {
      const ok = await this.save();
      if (!ok) throw new Error(`[orion] Save cancelled for [${this.constructor.name}].`);
    });
  }

  /**
   * Delete inside a transaction. Throws if the delete was cancelled by an event listener.
   */
  async deleteOrFail(): Promise<void> {
    const connection = ConnectionManager.getConnection(
      ModelMetadata.resolve(this).connection ?? undefined
    );
    await connection.transaction(async () => {
      const ok = await this.delete();
      if (!ok) throw new Error(`[orion] Delete cancelled for [${this.constructor.name}].`);
    });
  }

  /**
   * Fill attributes and save inside a transaction, throwing on failure.
   */
  async updateOrFail(attributes: Record<string, unknown>): Promise<void> {
    this.fill(attributes);
    await this.saveOrFail();
  }

  /**
   * Mass-update attributes and immediately save.
   * Only columns passing the `fillable` / `guarded` check are applied.
   */
  async update(attributes: Record<string, unknown>): Promise<boolean> {
    this.fill(attributes);
    return this.save();
  }

  /**
   * Delete this model's row from the database.
   * Fires `deleting` → DB → `deleted`.
   * Return `false` from `deleting` to abort. Sets `exists` to `false` on success.
   */
  async delete(): Promise<boolean> {
    if (!this.exists) return false;

    const dispatcher = ModelMetadata.get(this.constructor as Function).dispatcher;
    if (!(await dispatcher.fire('deleting', this))) return false;

    const cfg = ModelMetadata.resolve(this);
    await this._newQueryBuilder().where(cfg.primaryKey, this._attributes[cfg.primaryKey]).delete();

    this.exists = false;
    await dispatcher.fire('deleted', this);
    return true;
  }

  /**
   * Delete the model without firing any events.
   */
  async deleteQuietly(): Promise<boolean> {
    return withoutEvents(() => this.delete());
  }

  /**
   * Atomically increment a numeric column by `amount` and update the in-memory value.
   */
  async increment(column: string, amount = 1): Promise<this> {
    const cfg = ModelMetadata.resolve(this);
    await this._newQueryBuilder()
      .where(cfg.primaryKey, this._attributes[cfg.primaryKey])
      .increment(column, amount);
    this._attributes[column] = ((this._attributes[column] as number) ?? 0) + amount;
    return this;
  }

  /**
   * Atomically decrement a numeric column by `amount` and update the in-memory value.
   */
  async decrement(column: string, amount = 1): Promise<this> {
    return this.increment(column, -amount);
  }

  /**
   * Update the `updated_at` timestamp of this model (and optionally a named relation).
   * Passing no argument touches only this model.
   * Passing a relation name touches the related parent's `updated_at`.
   *
   * @example
   * ```ts
   * await comment.touch();          // updates comment.updated_at
   * await comment.touch('post');    // updates the related post's updated_at
   * ```
   */
  async touch(relation?: string): Promise<void> {
    if (relation) {
      await this._touchOwner(relation);
      return;
    }
    const cfg = ModelMetadata.resolve(this);
    if (!cfg.timestamps) return;
    const now = new Date();
    this._attributes[cfg.updatedAtColumn] = now;
    await this._newQueryBuilder()
      .where(cfg.primaryKey, this._attributes[cfg.primaryKey])
      .update({ [cfg.updatedAtColumn]: now });
  }

  private async _touchOwners(): Promise<void> {
    for (const rel of this._touches) {
      await this._touchOwner(rel);
    }
  }

  private async _touchOwner(relation: string): Promise<void> {
    const relInstance = (this as any)[relation]?.() as any;
    if (!relInstance) return;
    const related = await relInstance.first();
    if (related) await related.touch();
  }

  /**
   * Fetch a fresh copy of this model from the database.
   * Does not modify the current instance.
   */
  async fresh(): Promise<this | null> {
    if (!this.exists) return null;
    const cfg = ModelMetadata.resolve(this);
    const ctor = this.constructor as ModelSubclass<typeof this>;
    return ctor.find(this._attributes[cfg.primaryKey]) as Promise<this | null>;
  }

  /**
   * Re-hydrate this instance with the latest data from the database.
   * Modifies the current instance in place.
   */
  async refresh(): Promise<this> {
    const fresh = await this.fresh();
    if (fresh) {
      this._attributes = (fresh as Model)._attributes;
      this._original = (fresh as Model)._original;
      this._changes = {};
    }
    return this;
  }

  /**
   * Eager-load one or more relations onto this already-fetched instance.
   *
   * @example
   * ```ts
   * const user = await User.findOrFail(1);
   * await user.load('posts');
   * await user.load(['posts', 'profile']);
   * await user.load({ posts: q => q.where('active', true) });
   * ```
   */
  async load(relations: string | string[] | Record<string, EagerConstraint>): Promise<this> {
    await this._newQueryBuilder().loadModels([this as any], relations);
    return this;
  }

  /**
   * Eager-load relations that have not been loaded yet.
   * Already-loaded relations are skipped.
   */
  async loadMissing(relations: string | string[]): Promise<this> {
    const arr = typeof relations === 'string' ? [relations] : relations;
    const missing = arr.filter((r) => !this.relationLoaded(r));
    if (missing.length > 0) await this.load(missing);
    return this;
  }

  /**
   * Load relation counts onto this instance.
   * Results are stored in `_relations` as `{relation}_count`.
   *
   * @example
   * ```ts
   * await user.loadCount('posts');
   * user.getRelation<number>('posts_count');
   * ```
   */
  async loadCount(relations: string | string[]): Promise<this> {
    const arr = typeof relations === 'string' ? [relations] : relations;
    const cfg = ModelMetadata.resolve(this);
    const ctor = this.constructor as ModelSubclass<typeof this>;
    const fresh = await ctor
      .query()
      .where(cfg.primaryKey, this._attributes[cfg.primaryKey])
      .withCount(arr)
      .first();

    if (fresh) {
      for (const rel of arr) {
        const key = `${rel}_count`;
        this._relations[key] = (fresh as any)._attributes[key];
      }
    }

    return this;
  }

  /**
   * Load a relation aggregate onto this instance.
   * Stored in `_relations` as `{relation}_{fn}_{column}`.
   */
  private async _loadAggregate(
    fn: 'sum' | 'min' | 'max' | 'avg',
    relation: string,
    column: string
  ): Promise<this> {
    const cfg = ModelMetadata.resolve(this);
    const ctor = this.constructor as ModelSubclass<typeof this>;
    const alias = `${relation}_${fn}_${column}`;
    const method =
      fn === 'sum' ? 'withSum' : fn === 'min' ? 'withMin' : fn === 'max' ? 'withMax' : 'withAvg';

    const fresh = await (ctor.query() as any)
      .where(cfg.primaryKey, this._attributes[cfg.primaryKey])
      [method](relation, column, alias)
      .first();

    if (fresh) {
      this._relations[alias] = (fresh as any)._attributes[alias];
    }

    return this;
  }

  /**
   * Load a `SUM(column)` for a relation onto this instance.
   * Result stored in `_relations` as `{relation}_sum_{column}`.
   *
   * @example
   * ```ts
   * await user.loadSum('orders', 'amount');
   * user.getRelation<number>('orders_sum_amount');
   * ```
   */
  async loadSum(relation: string, column: string): Promise<this> {
    return this._loadAggregate('sum', relation, column);
  }

  /** Load a `MIN(column)` for a relation onto this instance. */
  async loadMin(relation: string, column: string): Promise<this> {
    return this._loadAggregate('min', relation, column);
  }

  /** Load a `MAX(column)` for a relation onto this instance. */
  async loadMax(relation: string, column: string): Promise<this> {
    return this._loadAggregate('max', relation, column);
  }

  /** Load an `AVG(column)` for a relation onto this instance. */
  async loadAvg(relation: string, column: string): Promise<this> {
    return this._loadAggregate('avg', relation, column);
  }

  /**
   * Return an unsaved copy of this model, optionally excluding columns.
   * Fires `replicating` (notification only — cannot cancel).
   */
  replicate(except: string[] = []): this {
    const cfg = ModelMetadata.resolve(this);
    const attrs = { ...this._attributes };

    delete attrs[cfg.primaryKey];
    for (const col of except) delete attrs[col];
    if (cfg.timestamps) {
      delete attrs[cfg.createdAtColumn];
      delete attrs[cfg.updatedAtColumn];
    }

    const ctor = this.constructor as ModelSubclass<typeof this>;
    const copy = ctor.newInstance(attrs) as this;
    ModelMetadata.get(this.constructor as Function).dispatcher.fireSync('replicating', copy);
    return copy;
  }

  // ── Mass assignment ───────────────────────────────────────────────────────

  /**
   * Populate attributes according to `fillable` / `guarded` rules.
   * @returns `this` for chaining.
   */
  fill(attributes: Record<string, unknown>): this {
    const cfg = ModelMetadata.resolve(this);

    for (const [key, value] of Object.entries(attributes)) {
      if (this._isFillable(key, cfg)) {
        this._attributes[key] = value;
      } else if (Model._strictMassAssign) {
        throw new Error(
          `[orion] Add [${key}] to fillable on [${this.constructor.name}] to allow mass assignment.`
        );
      }
    }

    return this;
  }

  private _isFillable(key: string, cfg: ReturnType<typeof ModelMetadata.resolve>): boolean {
    if (cfg.guarded.includes('*')) return cfg.fillable.includes(key);
    if (cfg.guarded.includes(key)) return false;
    if (cfg.fillable.includes('*') || cfg.fillable.length === 0) return true;
    return cfg.fillable.includes(key);
  }

  // ── Dirty tracking ────────────────────────────────────────────────────────

  /** Return `true` if any attribute has changed since last hydration / save. */
  isDirty(): boolean;
  /** Return `true` if the given attribute(s) have changed. */
  isDirty(columns: string | string[]): boolean;
  isDirty(columns?: string | string[]): boolean {
    const dirty = this._getDirtyAttributes();
    if (!columns) return Object.keys(dirty).length > 0;
    const cols = Array.isArray(columns) ? columns : [columns];
    return cols.some((c) => c in dirty);
  }

  /** Inverse of `isDirty`. */
  isClean(): boolean;
  isClean(columns: string | string[]): boolean;
  isClean(columns?: string | string[]): boolean {
    return !this.isDirty(columns as string);
  }

  /**
   * Return `true` if the given attribute(s) changed during the last `save()`.
   * Reflects the state _after_ saving, not the current in-memory state.
   */
  wasChanged(): boolean;
  wasChanged(columns: string | string[]): boolean;
  wasChanged(columns?: string | string[]): boolean {
    if (!columns) return Object.keys(this._changes).length > 0;
    const cols = Array.isArray(columns) ? columns : [columns];
    return cols.some((c) => c in this._changes);
  }

  /** Original value of an attribute as loaded from the database. */
  getOriginal(): Record<string, unknown>;
  getOriginal(column: string): unknown;
  getOriginal(column?: string): unknown {
    if (!column) return { ...this._original };
    return this._original[column];
  }

  /**
   * Attributes that changed during the last `save()`.
   * Available immediately after calling `save()`.
   */
  getChanges(): Record<string, unknown> {
    return { ...this._changes };
  }

  /**
   * Attribute values as they were **before** the last `save()` call.
   * Useful in event listeners to inspect what changed.
   */
  getPrevious(): Record<string, unknown>;
  getPrevious(column: string): unknown;
  getPrevious(column?: string): unknown {
    if (!column) return { ...this._previous };
    return this._previous[column];
  }

  private _getDirtyAttributes(): Record<string, unknown> {
    const dirty: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(this._attributes)) {
      if (!(key in this._original) || this._original[key] !== val) {
        dirty[key] = val;
      }
    }
    return dirty;
  }

  private _syncOriginal(): void {
    this._original = { ...this._attributes };
  }

  private _syncChanges(): void {
    this._changes = this._getDirtyAttributes();
  }

  // ── Attribute casting ─────────────────────────────────────────────────────

  /** @internal Used by the Proxy getter to apply casts. */
  _castGet(key: string, value: unknown): unknown {
    const cfg = ModelMetadata.resolve(this);
    const castType: CastType | undefined = this._instanceCasts?.[key] ?? cfg.casts[key];
    if (!castType || value === null || value === undefined) return value;

    // Class-based cast or Castable value object
    if (typeof castType === 'function') {
      const ctor = castType as any;
      // Castable: static castUsing() method
      const instance: any = typeof ctor.castUsing === 'function' ? ctor.castUsing() : new ctor();

      // CastsInboundAttributes has no get() — return value as-is
      if (typeof instance.get !== 'function') return value;

      // Caching: if shouldCache() and caching not disabled
      if (instance.shouldCache?.() && !cfg.withoutObjectCaching) {
        if (key in this._accessorCache) return this._accessorCache[key];
        const result = instance.get(value);
        this._accessorCache[key] = result;
        return result;
      }

      return instance.get(value);
    }

    // Parameterised cast: 'decimal:2', 'encrypted:array', 'SomeCast:p1,p2' etc.
    const castStr = castType as string;

    if (castStr.startsWith('decimal:')) {
      const n = parseInt(castStr.slice(8), 10);
      return parseFloat(Number(value).toFixed(n));
    }

    if (castStr === 'immutable_date' || castStr === 'immutable_datetime') {
      const d = value instanceof Date ? value : new Date(value as string);
      return Object.freeze(d);
    }

    if (castStr === 'json:unicode') {
      return typeof value === 'string' ? JSON.parse(value) : value;
    }

    if (castStr === 'hashed') {
      // hashed is write-only — reading returns the raw stored value
      return value;
    }

    if (castStr === 'AsStringable') {
      return new Stringable(String(value));
    }

    if (castStr === 'encrypted' || castStr === 'encrypted:json' || castStr === 'encrypted:array') {
      // Cipher must be set via Model._cipher; if not configured, return raw value
      const cipher = (this.constructor as any)._cipher as CipherContract | undefined;
      if (!cipher) return value;
      const decrypted = cipher.decrypt(String(value));
      if (castStr === 'encrypted:json' || castStr === 'encrypted:array') {
        return typeof decrypted === 'string' ? JSON.parse(decrypted) : decrypted;
      }
      return decrypted;
    }

    switch (castStr) {
      case 'number':
        return Number(value);
      case 'string':
        return String(value);
      case 'boolean':
        return Boolean(value);
      case 'json':
        return typeof value === 'string' ? JSON.parse(value) : value;
      case 'array':
        return typeof value === 'string' ? JSON.parse(value) : value;
      case 'date': {
        const d = value instanceof Date ? value : new Date(value as string);
        return d;
      }
      default:
        return value;
    }
  }

  /**
   * Transform a value before storing in `_attributes`.
   * Called by the Proxy `set` trap before writing to `_attributes`.
   */
  _castSet(key: string, value: unknown): unknown {
    const cfg = ModelMetadata.resolve(this);
    const castType: CastType | undefined = this._instanceCasts?.[key] ?? cfg.casts[key];
    if (!castType) return value;

    if (typeof castType === 'function') {
      const ctor = castType as any;
      const instance: any = typeof ctor.castUsing === 'function' ? ctor.castUsing() : new ctor();
      // Invalidate cache on set
      delete this._accessorCache[key];
      return typeof instance.set === 'function' ? instance.set(value) : value;
    }

    const castStr = castType as string;

    if (castStr === 'hashed') {
      // SHA-256 one-way hash using the built-in crypto module (no deps)
      const { createHash } = require('crypto');
      return createHash('sha256').update(String(value)).digest('hex');
    }

    if (castStr === 'json' || castStr === 'json:unicode' || castStr === 'array') {
      return typeof value === 'string' ? value : JSON.stringify(value);
    }

    if (castStr === 'encrypted' || castStr === 'encrypted:json' || castStr === 'encrypted:array') {
      const cipher = (this.constructor as any)._cipher as CipherContract | undefined;
      if (!cipher) return value;
      const payload = castStr !== 'encrypted' ? JSON.stringify(value) : String(value);
      return cipher.encrypt(payload);
    }

    if (castStr.startsWith('decimal:')) {
      return Number(value);
    }

    return value;
  }

  // ── Resource helpers ──────────────────────────────────────────────────────

  /**
   * Wrap this model in a `Resource` instance.
   * If a `ResourceClass` is passed it is used directly; otherwise the class
   * bound via `@UseResource` is used.
   *
   * @example
   * ```ts
   * user.toResource();                // uses @UseResource binding
   * user.toResource(UserResource);    // explicit class
   * ```
   */
  toResource<R>(resourceClass?: new (model: this) => R): R {
    const cfg = ModelMetadata.resolve(this);
    const Cls: (new (model: this) => R) | null =
      resourceClass ?? (cfg.resourceClass as (new (model: this) => R) | null);
    if (!Cls) {
      throw new Error(
        `[orion] No resource class bound to [${this.constructor.name}]. ` +
          `Use @UseResource(ResourceClass) or pass the class explicitly to toResource().`
      );
    }
    return new Cls(this);
  }

  /**
   * Merge additional cast types into this instance at runtime.
   * Merges with (but does not replace) class-level casts and any existing
   * instance casts applied by `withCasts()` at query time.
   *
   * @example
   * ```ts
   * user.mergeCasts({ settings: 'json', score: 'number' });
   * ```
   */
  mergeCasts(casts: Record<string, CastType>): this {
    this._instanceCasts = { ...(this._instanceCasts ?? {}), ...casts };
    return this;
  }

  /**
   * Override this method to control how `Date` objects are serialized in
   * `toArray()` / `toJSON()`. The default returns an ISO 8601 string.
   *
   * @example
   * ```ts
   * protected serializeDate(date: Date): string {
   *   return date.toLocaleDateString('pt-BR');
   * }
   * ```
   */
  protected serializeDate(date: Date): string {
    return date.toISOString();
  }

  /**
   * Disable per-instance accessor result caching for this model instance.
   * By default, accessors whose `CastClass` returns `shouldCache() === true`
   * have their result stored and reused. Call this to always recompute.
   */
  withoutObjectCaching(): this {
    ModelMetadata.get(this.constructor as Function).withoutObjectCaching = true;
    return this;
  }

  // ── Relationship helpers ──────────────────────────────────────────────────

  /**
   * Define a one-to-one relationship.
   * The foreign key defaults to `{thisModel}_id` on the related table.
   *
   * @example
   * ```ts
   * profile(): HasOne<Profile> {
   *   return this.hasOne(Profile);
   * }
   * ```
   */
  protected hasOne<T extends Model>(
    relatedClass: ModelSubclass<T>,
    foreignKey?: string,
    localKey?: string
  ): HasOne<T> {
    const cfg = ModelMetadata.resolve(this);
    const fk = foreignKey ?? `${toSnake(this.constructor.name)}_id`;
    const lk = localKey ?? cfg.primaryKey;
    return new HasOne<T>(relatedClass as unknown as ModelConstructor<T>, this, fk, lk);
  }

  /**
   * Define a one-to-many relationship.
   * The foreign key defaults to `{thisModel}_id` on the related table.
   *
   * @example
   * ```ts
   * comments(): HasMany<Comment> {
   *   return this.hasMany(Comment);
   * }
   * ```
   */
  protected hasMany<T extends Model>(
    relatedClass: ModelSubclass<T>,
    foreignKey?: string,
    localKey?: string
  ): HasMany<T> {
    const cfg = ModelMetadata.resolve(this);
    const fk = foreignKey ?? `${toSnake(this.constructor.name)}_id`;
    const lk = localKey ?? cfg.primaryKey;
    return new HasMany<T>(relatedClass as unknown as ModelConstructor<T>, this, fk, lk);
  }

  /**
   * Define the inverse of a `hasOne` or `hasMany` relationship.
   * The foreign key defaults to `{relatedModel}_id` on **this** table.
   *
   * @example
   * ```ts
   * author(): BelongsTo<User> {
   *   return this.belongsTo(User);
   * }
   * ```
   */
  protected belongsTo<T extends Model>(
    relatedClass: ModelSubclass<T>,
    foreignKey?: string,
    ownerKey?: string
  ): BelongsTo<T> {
    const relatedCfg = ModelMetadata.get(relatedClass);
    const fk = foreignKey ?? `${toSnake(relatedClass.name)}_id`;
    const ok = ownerKey ?? relatedCfg.primaryKey;
    return new BelongsTo<T>(relatedClass as unknown as ModelConstructor<T>, this, fk, ok);
  }

  /**
   * Define a many-to-many relationship via a pivot table.
   * Pivot table defaults to the two model names joined alphabetically with `_`.
   *
   * @example
   * ```ts
   * roles(): BelongsToMany<Role> {
   *   return this.belongsToMany(Role);
   * }
   * ```
   */
  protected belongsToMany<T extends Model>(
    relatedClass: ModelSubclass<T>,
    pivotTable?: string,
    foreignPivotKey?: string,
    relatedPivotKey?: string,
    localKey?: string,
    relatedKey?: string
  ): BelongsToMany<T> {
    const selfName = toSnake(this.constructor.name);
    const relatedName = toSnake(relatedClass.name);
    const sortedNames = [selfName, relatedName].sort();
    const pivot = pivotTable ?? `${sortedNames[0]}_${sortedNames[1]}`;
    const fk = foreignPivotKey ?? `${selfName}_id`;
    const rfk = relatedPivotKey ?? `${relatedName}_id`;
    const selfCfg = ModelMetadata.resolve(this);
    const relatedCfg = ModelMetadata.get(relatedClass);
    const lk = localKey ?? selfCfg.primaryKey;
    const rk = relatedKey ?? relatedCfg.primaryKey;
    return new BelongsToMany<T>(
      relatedClass as unknown as ModelConstructor<T>,
      this,
      pivot,
      fk,
      rfk,
      lk,
      rk
    );
  }

  // ── Through relationships ─────────────────────────────────────────────────

  /**
   * Define a has-one-through relationship.
   *
   * @example
   * ```ts
   * latestUser(): HasOneThrough<User> {
   *   return this.hasOneThrough(User, Supplier);
   *   // countries → suppliers.country_id → users.supplier_id
   * }
   * ```
   */
  protected hasOneThrough<T extends Model>(
    farClass: ModelSubclass<T>,
    throughClass: ModelSubclass<any>,
    firstKey?: string,
    secondKey?: string,
    localKey?: string,
    secondLocalKey?: string
  ): HasOneThrough<T> {
    const selfCfg = ModelMetadata.resolve(this);
    const throughCfg = ModelMetadata.get(throughClass);
    const fk = firstKey ?? `${toSnake(this.constructor.name)}_id`;
    const sk = secondKey ?? `${toSnake(throughClass.name)}_id`;
    const lk = localKey ?? selfCfg.primaryKey;
    const slk = secondLocalKey ?? throughCfg.primaryKey;
    return new HasOneThrough<T>(
      farClass as unknown as ModelConstructor<T>,
      throughClass as unknown as ModelConstructor<any>,
      this,
      fk,
      sk,
      lk,
      slk
    );
  }

  /**
   * Define a has-many-through relationship.
   *
   * @example
   * ```ts
   * posts(): HasManyThrough<Post> {
   *   return this.hasManyThrough(Post, User);
   *   // countries → users.country_id → posts.user_id
   * }
   * ```
   */
  protected hasManyThrough<T extends Model>(
    farClass: ModelSubclass<T>,
    throughClass: ModelSubclass<any>,
    firstKey?: string,
    secondKey?: string,
    localKey?: string,
    secondLocalKey?: string
  ): HasManyThrough<T> {
    const selfCfg = ModelMetadata.resolve(this);
    const throughCfg = ModelMetadata.get(throughClass);
    const fk = firstKey ?? `${toSnake(this.constructor.name)}_id`;
    const sk = secondKey ?? `${toSnake(throughClass.name)}_id`;
    const lk = localKey ?? selfCfg.primaryKey;
    const slk = secondLocalKey ?? throughCfg.primaryKey;
    return new HasManyThrough<T>(
      farClass as unknown as ModelConstructor<T>,
      throughClass as unknown as ModelConstructor<any>,
      this,
      fk,
      sk,
      lk,
      slk
    );
  }

  // ── Polymorphic relationships ─────────────────────────────────────────────

  /**
   * Define a polymorphic one-to-one relationship.
   *
   * @example
   * ```ts
   * image(): MorphOne<Image> {
   *   return this.morphOne(Image, 'imageable');
   * }
   * ```
   */
  protected morphOne<T extends Model>(
    relatedClass: ModelSubclass<T>,
    morphName: string,
    localKey?: string
  ): MorphOne<T> {
    const cfg = ModelMetadata.resolve(this);
    const lk = localKey ?? cfg.primaryKey;
    return new MorphOne<T>(relatedClass as unknown as ModelConstructor<T>, this, morphName, lk);
  }

  /**
   * Define a polymorphic one-to-many relationship.
   *
   * @example
   * ```ts
   * comments(): MorphMany<Comment> {
   *   return this.morphMany(Comment, 'commentable');
   * }
   * ```
   */
  protected morphMany<T extends Model>(
    relatedClass: ModelSubclass<T>,
    morphName: string,
    localKey?: string
  ): MorphMany<T> {
    const cfg = ModelMetadata.resolve(this);
    const lk = localKey ?? cfg.primaryKey;
    return new MorphMany<T>(relatedClass as unknown as ModelConstructor<T>, this, morphName, lk);
  }

  /**
   * Define the inverse of a polymorphic relationship.
   *
   * @example
   * ```ts
   * imageable(): MorphTo {
   *   return this.morphTo('imageable');
   * }
   * ```
   */
  protected morphTo(morphName: string, localKey?: string): MorphTo {
    const cfg = ModelMetadata.resolve(this);
    const lk = localKey ?? cfg.primaryKey;
    return new MorphTo(this, morphName, lk);
  }

  /**
   * Define a polymorphic many-to-many relationship (current model is the morphable side).
   *
   * @example
   * ```ts
   * tags(): MorphToMany<Tag> {
   *   return this.morphToMany(Tag, 'taggable');
   *   // pivot: taggables, FK to Tag: tag_id
   * }
   * ```
   */
  protected morphToMany<T extends Model>(
    relatedClass: ModelSubclass<T>,
    morphName: string,
    pivotTable?: string,
    relatedPivotKey?: string,
    localKey?: string,
    relatedKey?: string
  ): MorphToMany<T> {
    const selfCfg = ModelMetadata.resolve(this);
    const relatedCfg = ModelMetadata.get(relatedClass);
    const pivot = pivotTable ?? `${morphName}s`;
    const rfk = relatedPivotKey ?? `${toSnake(relatedClass.name)}_id`;
    const lk = localKey ?? selfCfg.primaryKey;
    const rk = relatedKey ?? relatedCfg.primaryKey;
    return new MorphToMany<T>(
      relatedClass as unknown as ModelConstructor<T>,
      this,
      pivot,
      morphName,
      rfk,
      lk,
      rk
    );
  }

  /**
   * Define the inverse of a polymorphic many-to-many relationship.
   *
   * @example
   * ```ts
   * posts(): MorphedByMany<Post> {
   *   return this.morphedByMany(Post, 'taggable');
   *   // pivot: taggables, current model FK: tag_id
   * }
   * ```
   */
  protected morphedByMany<T extends Model>(
    relatedClass: ModelSubclass<T>,
    morphName: string,
    pivotTable?: string,
    foreignPivotKey?: string,
    localKey?: string,
    relatedKey?: string
  ): MorphedByMany<T> {
    const selfCfg = ModelMetadata.resolve(this);
    const relatedCfg = ModelMetadata.get(relatedClass);
    const pivot = pivotTable ?? `${morphName}s`;
    const fk = foreignPivotKey ?? `${toSnake(this.constructor.name)}_id`;
    const lk = localKey ?? selfCfg.primaryKey;
    const rk = relatedKey ?? relatedCfg.primaryKey;
    return new MorphedByMany<T>(
      relatedClass as unknown as ModelConstructor<T>,
      this,
      pivot,
      morphName,
      fk,
      lk,
      rk
    );
  }

  // ── Relation store ────────────────────────────────────────────────────────

  /**
   * Retrieve a previously loaded relation value.
   * Returns `undefined` if the relation was not eager-loaded.
   *
   * @example
   * ```ts
   * const users = await User.with('posts').get();
   * const posts = users.first()?.getRelation<Collection<Post>>('posts');
   * ```
   */
  getRelation<T>(name: string): T | undefined {
    return this._relations[name] as T | undefined;
  }

  /** @internal Used by the eager loader to store a loaded relation. */
  setRelation(name: string, value: unknown): void {
    this._relations[name] = value;
  }

  /** Return `true` if the named relation has been loaded. */
  relationLoaded(name: string): boolean {
    return name in this._relations;
  }

  // ── Comparison ────────────────────────────────────────────────────────────

  /** Return `true` if two models represent the same database row. */
  is(other: Model): boolean {
    const cfg = ModelMetadata.resolve(this);
    return (
      this.constructor === other.constructor &&
      this._attributes[cfg.primaryKey] !== undefined &&
      this._attributes[cfg.primaryKey] === other._attributes[cfg.primaryKey]
    );
  }

  isNot(other: Model): boolean {
    return !this.is(other);
  }

  // ── Serialisation — visibility control ───────────────────────────────────

  /**
   * Make one or more columns visible for this instance, even if listed in `@hidden`.
   * Stacks with the class-level config; does not affect other instances.
   *
   * @example
   * ```ts
   * user.makeVisible('phone').toArray()
   * user.makeVisible(['phone', 'address']).toArray()
   * ```
   */
  makeVisible(columns: string | string[]): this {
    const cols = Array.isArray(columns) ? columns : [columns];
    this._instanceVisible = [...(this._instanceVisible ?? []), ...cols];
    // Remove from the instance hidden list so explicit makeVisible wins
    if (this._instanceHidden) {
      this._instanceHidden = this._instanceHidden.filter((c) => !cols.includes(c));
    }
    return this;
  }

  /**
   * Hide one or more columns for this instance.
   * Stacks with the class-level `@hidden` config.
   */
  makeHidden(columns: string | string[]): this {
    const cols = Array.isArray(columns) ? columns : [columns];
    this._instanceHidden = [...(this._instanceHidden ?? []), ...cols];
    return this;
  }

  /** Merge additional column names into the instance visible allowlist. */
  mergeVisible(columns: string[]): this {
    this._instanceVisible = [...(this._instanceVisible ?? []), ...columns];
    return this;
  }

  /** Merge additional column names into the instance hidden denylist. */
  mergeHidden(columns: string[]): this {
    this._instanceHidden = [...(this._instanceHidden ?? []), ...columns];
    return this;
  }

  /** Replace the entire instance visible allowlist. */
  setVisible(columns: string[]): this {
    this._instanceVisible = [...columns];
    return this;
  }

  /** Replace the entire instance hidden denylist. */
  setHidden(columns: string[]): this {
    this._instanceHidden = [...columns];
    return this;
  }

  // ── Serialisation — appended accessors ────────────────────────────────────

  /**
   * Append one or more computed accessor names to be included in `toArray()`.
   * The accessor must be a getter defined on the model class (or decorated with
   * `@accessor` in a future phase).
   */
  append(attrs: string | string[]): this {
    const list = Array.isArray(attrs) ? attrs : [attrs];
    this._instanceAppends = [
      ...(this._instanceAppends ?? ModelMetadata.resolve(this).appends),
      ...list,
    ];
    return this;
  }

  /** Merge additional accessor names into the instance appends list. */
  mergeAppends(attrs: string[]): this {
    this._instanceAppends = [
      ...(this._instanceAppends ?? ModelMetadata.resolve(this).appends),
      ...attrs,
    ];
    return this;
  }

  /** Replace the entire instance appends list. */
  setAppends(attrs: string[]): this {
    this._instanceAppends = [...attrs];
    return this;
  }

  /** Clear all appended accessors for this instance. */
  withoutAppends(): this {
    this._instanceAppends = [];
    return this;
  }

  // ── Serialisation — output ────────────────────────────────────────────────

  /**
   * Resolve the effective visible/hidden lists for this instance.
   * Priority (highest first):
   *   1. `_instanceVisible` (set via `makeVisible` / `setVisible`)
   *   2. Class `@visible` allowlist
   *   3. Class `@hidden` denylist, minus anything in `_instanceVisible`
   *   4. `_instanceHidden` (set via `makeHidden` / `setHidden`)
   */
  private _effectiveVisible(): { allowlist: string[] | null; denylist: Set<string> } {
    const cfg = ModelMetadata.resolve(this);

    // Allowlist: instance override → class @visible → null (all allowed)
    const allowlist: string[] | null =
      this._instanceVisible !== null
        ? this._instanceVisible
        : cfg.visible.length > 0
          ? cfg.visible
          : null;

    // Denylist: class @hidden + instance hidden, minus anything explicitly made visible
    const denylist = new Set<string>([...cfg.hidden, ...(this._instanceHidden ?? [])]);
    if (this._instanceVisible) {
      for (const col of this._instanceVisible) denylist.delete(col);
    }

    return { allowlist, denylist };
  }

  /**
   * Return only the model's attribute values as a plain object.
   * Applies `@visible` / `@hidden` and instance overrides.
   * Does **not** include loaded relations.
   */
  attributesToArray(): Record<string, unknown> {
    const { allowlist, denylist } = this._effectiveVisible();
    const result: Record<string, unknown> = {};

    for (const [key, raw] of Object.entries(this._attributes)) {
      if (allowlist !== null && !allowlist.includes(key)) continue;
      if (denylist.has(key)) continue;
      let cast = this._castGet(key, raw);
      // Apply serializeDate for any Date values that reach serialization
      if (cast instanceof Date) cast = this.serializeDate(cast);
      result[key] = cast;
    }

    // Append computed accessors
    const appendList = this._instanceAppends ?? ModelMetadata.resolve(this).appends;
    for (const attr of appendList) {
      result[attr] = (this as any)[attr];
    }

    return result;
  }

  /**
   * Return a plain object of attributes **and** all loaded relations, recursively.
   * This is the canonical serialization method — `toJSON()` delegates here.
   *
   * Relation values are serialized as:
   * - `Collection<Model>` → array of `toArray()` objects
   * - `Model` → `toArray()` object
   * - Anything else (counts, aggregates) → raw value
   *
   * @example
   * ```ts
   * const user = await User.with('posts').first();
   * JSON.stringify(user); // includes posts array
   * ```
   */
  toArray(): Record<string, unknown> {
    const result = this.attributesToArray();

    for (const [key, value] of Object.entries(this._relations)) {
      if (value instanceof Collection) {
        result[key] = [...value].map((item) => (item instanceof Model ? item.toArray() : item));
      } else if (value instanceof Model) {
        result[key] = value.toArray();
      } else {
        // Aggregate subquery result (count, sum, …) or null
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Alias for `attributesToArray()`. Kept for backwards compatibility.
   * Prefer `toArray()` when you want relations included.
   */
  toObject(): Record<string, unknown> {
    return this.attributesToArray();
  }

  /** Called automatically by `JSON.stringify()`. Delegates to `toArray()`. */
  toJSON(): Record<string, unknown> {
    return this.toArray();
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private _newQueryBuilder(): ModelBuilder<this> {
    const ctor = this.constructor as ModelSubclass<typeof this>;
    return ctor.query() as ModelBuilder<this>;
  }
}

// ── Encryption contract ───────────────────────────────────────────────────

/**
 * Interface for a user-provided encryption cipher.
 * Assign an implementation to `Model._cipher` to enable `encrypted` casts.
 *
 * @example
 * ```ts
 * Model._cipher = {
 *   encrypt: (v) => Buffer.from(v).toString('base64'),
 *   decrypt: (v) => Buffer.from(v, 'base64').toString(),
 * };
 * ```
 */
export interface CipherContract {
  encrypt(value: string): string;
  decrypt(value: string): string;
}

// ── Stringable helper ─────────────────────────────────────────────────────

/**
 * Lightweight string wrapper returned by the `'AsStringable'` cast.
 * Supports common string operations fluently.
 */
export class Stringable {
  constructor(private readonly value: string) {}

  toString(): string {
    return this.value;
  }
  toJSON(): string {
    return this.value;
  }

  upper(): Stringable {
    return new Stringable(this.value.toUpperCase());
  }
  lower(): Stringable {
    return new Stringable(this.value.toLowerCase());
  }
  trim(): Stringable {
    return new Stringable(this.value.trim());
  }
  slug(separator = '-'): Stringable {
    return new Stringable(
      this.value
        .toLowerCase()
        .replace(/\s+/g, separator)
        .replace(/[^a-z0-9-_]/g, '')
    );
  }
  contains(needle: string): boolean {
    return this.value.includes(needle);
  }
  startsWith(prefix: string): boolean {
    return this.value.startsWith(prefix);
  }
  endsWith(suffix: string): boolean {
    return this.value.endsWith(suffix);
  }
  length(): number {
    return this.value.length;
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────

function toSnake(name: string): string {
  return name
    .replace(/([A-Z])/g, (m, p1, offset) => (offset > 0 ? '_' : '') + p1.toLowerCase())
    .toLowerCase();
}

function toSnakePlural(className: string): string {
  const snake = toSnake(className);

  if (
    snake.endsWith('s') ||
    snake.endsWith('x') ||
    snake.endsWith('z') ||
    snake.endsWith('ch') ||
    snake.endsWith('sh')
  ) {
    return snake + 'es';
  }
  if (snake.endsWith('y') && !/[aeiou]y$/.test(snake)) {
    return snake.slice(0, -1) + 'ies';
  }
  return snake + 's';
}
