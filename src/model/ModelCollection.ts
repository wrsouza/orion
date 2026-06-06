import { Collection } from './Collection';
import type { ModelBuilder, ModelConstructor } from './ModelBuilder';
import { ModelMetadata } from './ModelMetadata';
import { EagerLoader, EagerLoadMap } from './EagerLoader';

/**
 * A `Collection` subclass that carries a reference to the model class,
 * enabling PK-based lookups, DB operations, and bulk visibility control.
 *
 * Returned by `ModelBuilder.get()` and by all eager-loaded collection relations.
 *
 * @example
 * ```ts
 * const users = await User.where('active', true).get(); // ModelCollection<User>
 *
 * users.find(1)              // User | undefined
 * users.modelKeys()          // [1, 2, 3]
 * users.except([1, 2])       // ModelCollection without id 1 & 2
 * users.toQuery().update({ active: false })
 *
 * await users.load('posts')          // eager-load onto existing instances
 * await users.fresh('posts')         // re-fetch + eager load from DB
 *
 * users.makeVisible('phone').makeHidden('email')
 * ```
 */
export class ModelCollection<T> extends Collection<T> {
  /** The model constructor — used to resolve PKs and run queries. */
  readonly modelClass: ModelConstructor<any>;

  constructor(items: T[] = [], modelClass: ModelConstructor<any>) {
    super(items);
    this.modelClass = modelClass;
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private _pk(): string {
    return ModelMetadata.get(this.modelClass as unknown as Function).primaryKey;
  }

  private _pkOf(model: T): unknown {
    return (model as any)._attributes[this._pk()];
  }

  // ── PK-based lookups ──────────────────────────────────────────────────────

  /**
   * Find a model by its primary key.
   * Returns `undefined` if not present in the collection.
   *
   * @example
   * ```ts
   * const user = users.find(3); // User | undefined
   * ```
   */
  findByKey(id: unknown): T | undefined {
    const pk = this._pk();
    // eslint-disable-next-line eqeqeq -- PK comparison uses == intentionally (DB may return string for numeric IDs)
    return [...this].find((m) => (m as any)._attributes[pk] == id);
  }

  /**
   * Find a model by primary key; throws if not found.
   *
   * @example
   * ```ts
   * const user = users.findOrFail(3); // User (throws if missing)
   * ```
   */
  findOrFail(id: unknown): T {
    const result = this.findByKey(id);
    if (!result) {
      throw new Error(`[orion] Model with primary key "${id}" not found in collection.`);
    }
    return result;
  }

  /**
   * Return an array of every model's primary key value.
   *
   * @example
   * ```ts
   * users.modelKeys(); // [1, 2, 3, 4]
   * ```
   */
  modelKeys(): unknown[] {
    const pk = this._pk();
    return [...this].map((m) => (m as any)._attributes[pk]);
  }

  /**
   * Return a new `ModelCollection` excluding models whose PK is in `ids`.
   *
   * @example
   * ```ts
   * users.except([1, 2]); // all users except id 1 and 2
   * ```
   */
  except(ids: unknown[]): ModelCollection<T> {
    const pk = this._pk();
    return new ModelCollection(
      [...this].filter((m) => !ids.includes((m as any)._attributes[pk])),
      this.modelClass
    );
  }

  /**
   * Return a new `ModelCollection` containing only models whose PK is in `ids`.
   *
   * @example
   * ```ts
   * users.only([3, 4]); // only users with id 3 or 4
   * ```
   */
  only(ids: unknown[]): ModelCollection<T> {
    const pk = this._pk();
    return new ModelCollection(
      [...this].filter((m) => ids.includes((m as any)._attributes[pk])),
      this.modelClass
    );
  }

  /**
   * Return models in `this` whose PK is **not** in `other`.
   *
   * @example
   * ```ts
   * const onlyInA = a.diff(b);
   * ```
   */
  diff(other: ModelCollection<T>): ModelCollection<T> {
    const otherKeys = new Set(other.modelKeys());
    const pk = this._pk();
    return new ModelCollection(
      [...this].filter((m) => !otherKeys.has((m as any)._attributes[pk])),
      this.modelClass
    );
  }

  /**
   * Return models whose PK appears in **both** collections.
   *
   * @example
   * ```ts
   * const shared = a.intersect(b);
   * ```
   */
  intersect(other: ModelCollection<T>): ModelCollection<T> {
    const otherKeys = new Set(other.modelKeys());
    const pk = this._pk();
    return new ModelCollection(
      [...this].filter((m) => otherKeys.has((m as any)._attributes[pk])),
      this.modelClass
    );
  }

  // ── DB operations ─────────────────────────────────────────────────────────

  /**
   * Return a `ModelBuilder` pre-constrained to the PKs of every model in
   * this collection — equivalent to `Model.whereIn('id', [1,2,3])`.
   *
   * Useful for bulk updates or re-querying with extra constraints.
   *
   * @example
   * ```ts
   * await users.toQuery().update({ active: false });
   * ```
   */
  toQuery(): ModelBuilder<any> {
    const keys = this.modelKeys();
    const pk = this._pk();
    return (this.modelClass as any).whereIn(pk, keys);
  }

  /**
   * Re-fetch all models from the database by their PKs, optionally eager-loading
   * relations. Returns a **new** `ModelCollection` — does not mutate `this`.
   *
   * @example
   * ```ts
   * const fresh = await users.fresh();
   * const fresh = await users.fresh('posts');
   * const fresh = await users.fresh(['posts', 'comments']);
   * ```
   */
  async fresh(relations?: string | string[]): Promise<ModelCollection<T>> {
    const keys = this.modelKeys();
    if (keys.length === 0) return new ModelCollection<T>([], this.modelClass);

    const pk = this._pk();
    let qb: any = (this.modelClass as any).whereIn(pk, keys);

    if (relations) {
      const arr = typeof relations === 'string' ? [relations] : relations;
      qb = qb.with(arr);
    }

    return qb.get() as Promise<ModelCollection<T>>;
  }

  /**
   * Eager-load one or more relations onto every model in this collection
   * **in-place**. Modifies the existing instances; returns `this` for chaining.
   *
   * @example
   * ```ts
   * await users.load('posts');
   * await users.load(['posts', 'comments']);
   * ```
   */
  async load(relations: string | string[]): Promise<this> {
    const arr = typeof relations === 'string' ? [relations] : relations;
    if (arr.length === 0 || this.length === 0) return this;

    const eagerMap: EagerLoadMap = new Map(arr.map((r) => [r, null]));
    await EagerLoader.load(
      [...this] as unknown as import('./Model').Model[],
      eagerMap,
      this.modelClass as any
    );
    return this;
  }

  /**
   * Like `load()`, but skips relations already present on **every** model.
   * A relation is considered loaded if at least one model already has it in
   * `_relations`.
   *
   * @example
   * ```ts
   * await users.loadMissing('posts');
   * ```
   */
  async loadMissing(relations: string | string[]): Promise<this> {
    const arr = typeof relations === 'string' ? [relations] : relations;
    const missing = arr.filter((r) =>
      [...this].some((m) => !Object.prototype.hasOwnProperty.call((m as any)._relations, r))
    );
    if (missing.length > 0) await this.load(missing);
    return this;
  }

  // ── Visibility delegation ─────────────────────────────────────────────────

  /**
   * Call `makeVisible(columns)` on every model in the collection.
   * Returns `this` for chaining.
   */
  makeVisible(columns: string | string[]): this {
    for (const model of this) (model as any).makeVisible(columns);
    return this;
  }

  /**
   * Call `makeHidden(columns)` on every model in the collection.
   * Returns `this` for chaining.
   */
  makeHidden(columns: string | string[]): this {
    for (const model of this) (model as any).makeHidden(columns);
    return this;
  }

  /**
   * Call `setVisible(columns)` on every model in the collection.
   * Replaces the instance visible list on each model.
   */
  setVisible(columns: string[]): this {
    for (const model of this) (model as any).setVisible(columns);
    return this;
  }

  /**
   * Call `setHidden(columns)` on every model in the collection.
   * Replaces the instance hidden list on each model.
   */
  setHidden(columns: string[]): this {
    for (const model of this) (model as any).setHidden(columns);
    return this;
  }

  /**
   * Call `mergeVisible(columns)` on every model — adds to the existing visible list.
   */
  mergeVisible(columns: string | string[]): this {
    for (const model of this) (model as any).mergeVisible(columns);
    return this;
  }

  /**
   * Call `mergeHidden(columns)` on every model — adds to the existing hidden list.
   */
  mergeHidden(columns: string | string[]): this {
    for (const model of this) (model as any).mergeHidden(columns);
    return this;
  }

  // ── Appends delegation ────────────────────────────────────────────────────

  /**
   * Add accessor name(s) to the appends list on every model.
   */
  append(attrs: string | string[]): this {
    for (const model of this) (model as any).append(attrs);
    return this;
  }

  /**
   * Replace the appends list on every model.
   */
  setAppends(attrs: string[]): this {
    for (const model of this) (model as any).setAppends(attrs);
    return this;
  }

  /**
   * Clear all appended accessors from every model.
   */
  withoutAppends(): this {
    for (const model of this) (model as any).withoutAppends();
    return this;
  }

  // ── PK-based utilities ────────────────────────────────────────────────────

  /**
   * Return `true` if the collection contains a model with the given PK,
   * or if it contains the given model instance (compared by PK).
   *
   * @example
   * ```ts
   * users.contains(1);      // true/false
   * users.contains(someUser);
   * ```
   */
  contains(pkOrModel: unknown): boolean {
    const pk = this._pk();
    const id =
      pkOrModel !== null && typeof pkOrModel === 'object' && '_attributes' in (pkOrModel as object)
        ? (pkOrModel as any)._attributes[pk]
        : pkOrModel;
    // eslint-disable-next-line eqeqeq -- PK comparison uses == intentionally (DB may return string for numeric IDs)
    return [...this].some((m) => (m as any)._attributes[pk] == id);
  }

  /**
   * Deduplicate by primary key, keeping the first occurrence of each.
   */
  unique(): ModelCollection<T> {
    const pk = this._pk();
    const seen = new Set<unknown>();
    const items: T[] = [];
    for (const model of this) {
      const id = (model as any)._attributes[pk];
      if (!seen.has(id)) {
        seen.add(id);
        items.push(model);
      }
    }
    return new ModelCollection(items, this.modelClass);
  }

  /**
   * Split the collection into two based on a predicate.
   * Returns `[matching, nonMatching]`.
   *
   * @example
   * ```ts
   * const [admins, users] = all.partition(u => u.is_admin);
   * ```
   */
  partition(predicate: (item: T) => boolean): [ModelCollection<T>, ModelCollection<T>] {
    const pass: T[] = [];
    const fail: T[] = [];
    for (const model of this) {
      (predicate(model) ? pass : fail).push(model);
    }
    return [new ModelCollection(pass, this.modelClass), new ModelCollection(fail, this.modelClass)];
  }

  // ── Aggregate eager-loads ─────────────────────────────────────────────────

  /**
   * Load a `COUNT(*)` for a relation onto every model in the collection.
   * The result is stored as `{relation}_count` in `_relations`.
   *
   * @example
   * ```ts
   * await users.loadCount('posts');
   * users.first().getRelation<number>('posts_count');
   * ```
   */
  async loadCount(relations: string | string[]): Promise<this> {
    const arr = typeof relations === 'string' ? [relations] : relations;
    const models = [...this] as unknown as import('./Model').Model[];
    if (models.length === 0) return this;
    const pk = this._pk();
    const keys = this.modelKeys();
    let aggQb: any = (this.modelClass as any).whereIn(pk, keys);
    for (const r of arr) aggQb = aggQb.withCount(r);
    const fresh = await aggQb.get();
    for (const freshModel of fresh) {
      const id = (freshModel as any)._attributes[pk];
      // eslint-disable-next-line eqeqeq -- PK comparison uses == intentionally (DB may return string for numeric IDs)
      const target = models.find((m) => (m as any)._attributes[pk] == id);
      if (target) {
        for (const r of arr) {
          const key = `${r}_count`;
          (target as any)._relations[key] = (freshModel as any)._relations[key];
        }
      }
    }
    return this;
  }

  /**
   * Load `SUM(column)` for a relation onto every model.
   * Stored as `{relation}_sum_{column}` in `_relations`.
   */
  async loadSum(relation: string, column: string): Promise<this> {
    return this._loadAggregate('Sum', relation, column);
  }

  /** Load `MIN(column)` for a relation onto every model. */
  async loadMin(relation: string, column: string): Promise<this> {
    return this._loadAggregate('Min', relation, column);
  }

  /** Load `MAX(column)` for a relation onto every model. */
  async loadMax(relation: string, column: string): Promise<this> {
    return this._loadAggregate('Max', relation, column);
  }

  /** Load `AVG(column)` for a relation onto every model. */
  async loadAvg(relation: string, column: string): Promise<this> {
    return this._loadAggregate('Avg', relation, column);
  }

  private async _loadAggregate(
    fn: 'Sum' | 'Min' | 'Max' | 'Avg',
    relation: string,
    column: string
  ): Promise<this> {
    const models = [...this] as unknown as import('./Model').Model[];
    if (models.length === 0) return this;
    const pk = this._pk();
    const keys = this.modelKeys();
    const method = `with${fn}` as 'withSum' | 'withMin' | 'withMax' | 'withAvg';
    const aggQb: any = (this.modelClass as any).whereIn(pk, keys)[method](relation, column);
    const fresh = await aggQb.get();
    const relKey = `${relation}_${fn.toLowerCase()}_${column}`;
    for (const freshModel of fresh) {
      const id = (freshModel as any)._attributes[pk];
      // eslint-disable-next-line eqeqeq -- PK comparison uses == intentionally (DB may return string for numeric IDs)
      const target = models.find((m) => (m as any)._attributes[pk] == id);
      if (target) (target as any)._relations[relKey] = (freshModel as any)._relations[relKey];
    }
    return this;
  }

  // ── Resource conversion ───────────────────────────────────────────────────

  /**
   * Wrap this collection in a `ResourceCollection`.
   * Uses the resource class bound to the model via `@UseResource`, or a plain
   * pass-through `ResourceCollection` if none is registered.
   *
   * @example
   * ```ts
   * const resource = users.toResourceCollection();
   * resource.resolve(); // { data: [...] }
   * ```
   */
  /**
   * Wrap this collection in a `ResourceCollection`.
   *
   * Resolution order:
   * 1. `collectionClass` passed explicitly
   * 2. Class bound via `@UseResourceCollection` on the model
   * 3. Plain `ResourceCollection` (pass-through, no field transformation)
   *
   * @example
   * ```ts
   * users.toResourceCollection();                    // auto-discover
   * users.toResourceCollection(UserResourceCollection); // explicit
   * ```
   */
  toResourceCollection(
    collectionClass?: new (items: any[], resourceClass?: any) => any
  ): import('../resources/ResourceCollection').ResourceCollection<T, any> {
    const { ResourceCollection } = require('../resources/ResourceCollection');
    const cfg = ModelMetadata.get(this.modelClass as unknown as Function);
    const Cls = collectionClass ?? cfg.resourceCollectionClass ?? ResourceCollection;
    const resourceClass = cfg.resourceClass ?? undefined;
    return new Cls([...this], resourceClass);
  }
}
