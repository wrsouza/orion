import { Connection } from '../connection/Connection';
import { ConnectionManager } from '../connection/ConnectionManager';
import { Expression } from '../query/Expression';
import { JoinClause } from '../query/JoinClause';
import { QueryBuilder } from '../query/QueryBuilder';
import { QueryGrammar } from '../query/grammars/QueryGrammar';
import { Collection } from './Collection';
import { ModelCollection } from './ModelCollection';
import { Paginator, SimplePaginator } from './Paginator';
import { EagerLoader, EagerConstraint, EagerLoadMap } from './EagerLoader';
import { ModelMetadata } from './ModelMetadata';
import { MorphMap } from './MorphMap';

/**
 * Constructor signature for any Model subclass.
 * Used as the generic constraint that lets static methods stay polymorphic.
 */
export interface ModelConstructor<T> {
  new (): T;
  getTable(): string;
  getPrimaryKey(): string;
  hydrate(row: Record<string, unknown>): T;
}

/**
 * A type-safe query builder that wraps `QueryBuilder` via composition and
 * returns hydrated model instances instead of raw rows.
 *
 * All fluent WHERE / JOIN / ORDER / SELECT methods delegate to the internal
 * `QueryBuilder` and return `this`, keeping the chain strongly typed as
 * `ModelBuilder<T>` throughout.
 *
 * Terminal methods (`get`, `first`, `find`, etc.) execute the query and return
 * typed results: `Collection<T>` for multi-row results, `T | null` for single.
 *
 * **Global scopes** registered on the model (via `@scopedBy` or the
 * `SoftDeletes` mixin) are applied automatically before every query unless
 * bypassed with `withoutGlobalScope` / `withoutGlobalScopes`.
 *
 * **Local scopes** decorated with `@scope` are accessible at runtime via the
 * Proxy returned by `Model.query()` — call them just like regular methods on
 * the builder: `User.query().popular().active().get()`.
 *
 * @example
 * ```ts
 * const users: Collection<User> = await User.where('active', true).orderBy('name').get();
 * const user:  User | null      = await User.where('email', 'x@y.com').first();
 * ```
 */
export class ModelBuilder<T extends object> {
  /** The underlying raw query builder. */
  _qb: QueryBuilder;
  protected readonly modelClass: ModelConstructor<T>;

  /**
   * Set of global scope names to skip for this query.
   * Populated by `withoutGlobalScope` / `withoutGlobalScopes`.
   */
  private _removedScopes = new Set<string>();

  /** Eager load specs: relation name → optional constraint. */
  _eagerLoads: EagerLoadMap = new Map();

  /**
   * When `true`, the soft-delete scope is bypassed and all rows are included.
   * Set by `withTrashed()`.
   */
  _withTrashed = false;

  /**
   * When `true`, only soft-deleted rows are returned.
   * Set by `onlyTrashed()`.
   */
  _onlyTrashed = false;

  /** Extra cast overrides applied to every hydrated model from this query. */
  private _extraCasts: Record<string, import('./ModelMetadata').CastType> = {};

  constructor(modelClass: ModelConstructor<T>, connection: Connection, grammar?: QueryGrammar) {
    this.modelClass = modelClass;
    this._qb = new QueryBuilder(connection, grammar);
    this._qb.from(modelClass.getTable());
    this._qb.primaryKey = modelClass.getPrimaryKey();
  }

  // ── Global scopes ─────────────────────────────────────────────────────────

  /**
   * Exclude a global scope (by its class name) from this query.
   *
   * @example
   * ```ts
   * await User.withoutGlobalScope('ActiveScope').get();
   * ```
   */
  withoutGlobalScope(name: string): this {
    this._removedScopes.add(name);
    return this;
  }

  /**
   * Exclude multiple global scopes from this query.
   *
   * @example
   * ```ts
   * await User.withoutGlobalScopes(['ActiveScope', 'CountryScope']).get();
   * ```
   */
  withoutGlobalScopes(names?: string[]): this {
    if (!names) {
      // Remove all
      const cfg = ModelMetadata.get(this.modelClass as unknown as Function);
      for (const name of cfg.globalScopes.keys()) {
        this._removedScopes.add(name);
      }
    } else {
      names.forEach((n) => this._removedScopes.add(n));
    }
    return this;
  }

  /**
   * Apply all global scopes except the listed ones.
   */
  withoutGlobalScopesExcept(keep: string[]): this {
    const cfg = ModelMetadata.get(this.modelClass as unknown as Function);
    for (const name of cfg.globalScopes.keys()) {
      if (!keep.includes(name)) this._removedScopes.add(name);
    }
    return this;
  }

  /** @internal Apply registered global scopes to the internal QueryBuilder. */
  private _applyGlobalScopes(): void {
    // Walk the prototype chain so scopes registered on mixin base classes
    // (e.g. SoftDeletable from SoftDeletes(Model)) are inherited by subclasses.
    const seen = new Set<string>();
    let target: Function | null = this.modelClass as unknown as Function;
    while (target && target !== Function.prototype) {
      const cfg = ModelMetadata.get(target);
      for (const [name, entry] of cfg.globalScopes) {
        if (seen.has(name) || this._removedScopes.has(name)) continue;
        seen.add(name);
        entry.scope.apply(this, this.modelClass as unknown as Function);
      }
      target = Object.getPrototypeOf(target);
    }
  }

  // ── Soft delete scope helpers ─────────────────────────────────────────────

  /**
   * Include soft-deleted rows in the query results.
   * Removes the `SoftDeleteScope` for this query only.
   *
   * @example
   * ```ts
   * const all = await Post.withTrashed().get();
   * ```
   */
  withTrashed(): this {
    this._withTrashed = true;
    this._onlyTrashed = false;
    this._removedScopes.add('SoftDeleteScope');
    return this;
  }

  /**
   * Return only soft-deleted rows.
   *
   * @example
   * ```ts
   * const deleted = await Post.onlyTrashed().get();
   * ```
   */
  onlyTrashed(): this {
    this._onlyTrashed = true;
    this._withTrashed = false;
    this._removedScopes.add('SoftDeleteScope');
    this._qb.whereNotNull('deleted_at');
    return this;
  }

  /**
   * Restore soft-deleted rows matching the current WHERE clause.
   * Sets `deleted_at` to NULL for all matching rows.
   */
  async restore(): Promise<number> {
    return this.withTrashed()._qb.update({ deleted_at: null });
  }

  // ── SELECT ────────────────────────────────────────────────────────────────

  select(...columns: (string | Expression)[]): this {
    this._qb.select(...columns);
    return this;
  }

  addSelect(...columns: (string | Expression)[]): this {
    this._qb.addSelect(...columns);
    return this;
  }

  selectRaw(sql: string, bindings: unknown[] = []): this {
    this._qb.selectRaw(sql, bindings);
    return this;
  }

  distinct(): this {
    this._qb.distinct();
    return this;
  }

  // ── FROM ──────────────────────────────────────────────────────────────────

  from(table: string | Expression): this {
    this._qb.from(table);
    return this;
  }

  // ── WHERE ─────────────────────────────────────────────────────────────────

  where(
    column: string | ((q: QueryBuilder) => void),
    operatorOrValue?: unknown,
    value?: unknown
  ): this {
    if (value !== undefined) {
      this._qb.where(column as string, operatorOrValue, value);
    } else {
      this._qb.where(column as string, operatorOrValue);
    }
    return this;
  }

  orWhere(
    column: string | ((q: QueryBuilder) => void),
    operatorOrValue?: unknown,
    value?: unknown
  ): this {
    if (value !== undefined) {
      this._qb.orWhere(column as string, operatorOrValue, value);
    } else {
      this._qb.orWhere(column as string, operatorOrValue);
    }
    return this;
  }

  whereIn(column: string, values: unknown[] | QueryBuilder): this {
    this._qb.whereIn(column, values);
    return this;
  }

  orWhereIn(column: string, values: unknown[] | QueryBuilder): this {
    this._qb.orWhereIn(column, values);
    return this;
  }

  whereNotIn(column: string, values: unknown[] | QueryBuilder): this {
    this._qb.whereNotIn(column, values);
    return this;
  }

  orWhereNotIn(column: string, values: unknown[] | QueryBuilder): this {
    this._qb.orWhereNotIn(column, values);
    return this;
  }

  whereNull(column: string): this {
    this._qb.whereNull(column);
    return this;
  }

  orWhereNull(column: string): this {
    this._qb.orWhereNull(column);
    return this;
  }

  whereNotNull(column: string): this {
    this._qb.whereNotNull(column);
    return this;
  }

  orWhereNotNull(column: string): this {
    this._qb.orWhereNotNull(column);
    return this;
  }

  whereBetween(column: string, range: [unknown, unknown]): this {
    this._qb.whereBetween(column, range);
    return this;
  }

  whereNotBetween(column: string, range: [unknown, unknown]): this {
    this._qb.whereNotBetween(column, range);
    return this;
  }

  whereColumn(first: string, operatorOrSecond: string, second?: string): this {
    this._qb.whereColumn(first, operatorOrSecond, second!);
    return this;
  }

  orWhereColumn(first: string, operatorOrSecond: string, second?: string): this {
    this._qb.orWhereColumn(first, operatorOrSecond, second!);
    return this;
  }

  whereRaw(sql: string, bindings: unknown[] = []): this {
    this._qb.whereRaw(sql, bindings);
    return this;
  }

  orWhereRaw(sql: string, bindings: unknown[] = []): this {
    this._qb.orWhereRaw(sql, bindings);
    return this;
  }

  whereExists(callback: (q: QueryBuilder) => void): this {
    this._qb.whereExists(callback);
    return this;
  }

  whereNotExists(callback: (q: QueryBuilder) => void): this {
    this._qb.whereNotExists(callback);
    return this;
  }

  // ── JOIN ──────────────────────────────────────────────────────────────────

  join(
    table: string,
    firstOrCb: string | ((j: JoinClause) => void),
    operator?: string,
    second?: string
  ): this {
    this._qb.join(table, firstOrCb as string, operator, second);
    return this;
  }

  leftJoin(
    table: string,
    firstOrCb: string | ((j: JoinClause) => void),
    operator?: string,
    second?: string
  ): this {
    this._qb.leftJoin(table, firstOrCb as string, operator, second);
    return this;
  }

  rightJoin(
    table: string,
    firstOrCb: string | ((j: JoinClause) => void),
    operator?: string,
    second?: string
  ): this {
    this._qb.rightJoin(table, firstOrCb as string, operator, second);
    return this;
  }

  crossJoin(table: string): this {
    this._qb.crossJoin(table);
    return this;
  }

  // ── ORDER BY ──────────────────────────────────────────────────────────────

  orderBy(column: string, direction: 'asc' | 'desc' = 'asc'): this {
    this._qb.orderBy(column, direction);
    return this;
  }

  orderByDesc(column: string): this {
    this._qb.orderByDesc(column);
    return this;
  }

  latest(column = 'created_at'): this {
    this._qb.latest(column);
    return this;
  }

  oldest(column = 'created_at'): this {
    this._qb.oldest(column);
    return this;
  }

  orderByRaw(sql: string, bindings: unknown[] = []): this {
    this._qb.orderByRaw(sql, bindings);
    return this;
  }

  // ── GROUP BY / HAVING ─────────────────────────────────────────────────────

  groupBy(...columns: string[]): this {
    this._qb.groupBy(...columns);
    return this;
  }

  having(column: string, operator: string, value: unknown): this {
    this._qb.having(column, operator, value);
    return this;
  }

  orHaving(column: string, operator: string, value: unknown): this {
    this._qb.orHaving(column, operator, value);
    return this;
  }

  havingRaw(sql: string, bindings: unknown[] = []): this {
    this._qb.havingRaw(sql, bindings);
    return this;
  }

  // ── LIMIT / OFFSET ────────────────────────────────────────────────────────

  limit(value: number): this {
    this._qb.limit(value);
    return this;
  }

  offset(value: number): this {
    this._qb.offset(value);
    return this;
  }

  skip(value: number): this {
    this._qb.skip(value);
    return this;
  }

  take(value: number): this {
    this._qb.take(value);
    return this;
  }

  forPage(page: number, perPage = 15): this {
    this._qb.forPage(page, perPage);
    return this;
  }

  // ── LOCKING ───────────────────────────────────────────────────────────────

  // ── EAGER LOADING ─────────────────────────────────────────────────────────

  /**
   * Specify relationships to eager-load with the query results.
   * Prevents N+1 by loading all related records in a single additional query.
   *
   * @example
   * ```ts
   * // Simple
   * await Post.with('author').get();
   *
   * // Multiple
   * await Post.with(['author', 'comments']).get();
   *
   * // Nested (loads comments for each post)
   * await Post.with('comments.author').get();
   *
   * // Constrained eager load
   * await Post.with({
   *   comments: (q) => q.where('approved', true).latest(),
   * }).get();
   * ```
   */
  with(relations: string | string[] | Record<string, EagerConstraint>): this {
    if (typeof relations === 'string') {
      this._eagerLoads.set(relations, null);
    } else if (Array.isArray(relations)) {
      for (const r of relations) this._eagerLoads.set(r, null);
    } else {
      for (const [r, fn] of Object.entries(relations)) {
        this._eagerLoads.set(r, fn);
      }
    }
    return this;
  }

  // ── RELATIONSHIP QUERIES ──────────────────────────────────────────────────

  /**
   * Add a `WHERE EXISTS` constraint for the named relationship.
   *
   * @example
   * ```ts
   * Post.has('comments').get()                 // posts that have at least 1 comment
   * Post.has('comments', '>=', 3).get()        // posts with 3+ comments
   * ```
   */
  has(relation: string, operator = '>=', count = 1): this {
    const rel = this._resolveRelation(relation);
    const parentTable = this.modelClass.getTable();

    if (operator === '>=' && count === 1) {
      // Simple EXISTS
      this._qb.whereRaw(`EXISTS (${rel.getExistsQuery(parentTable)})`);
    } else {
      // Count-based: WHERE (SELECT COUNT(*) ...) >= N
      this._qb.whereRaw(`(${rel.getCountQuery(parentTable)}) ${operator} ?`, [count]);
    }

    return this;
  }

  /** `WHERE NOT EXISTS` — models that have no related records. */
  doesntHave(relation: string): this {
    const rel = this._resolveRelation(relation);
    const parentTable = this.modelClass.getTable();
    this._qb.whereRaw(`NOT EXISTS (${rel.getExistsQuery(parentTable)})`);
    return this;
  }

  /**
   * Add a constrained `WHERE EXISTS` subquery.
   *
   * @example
   * ```ts
   * Post.whereHas('comments', q => q.where('approved', true)).get()
   * ```
   */
  whereHas(
    relation: string,
    callback?: (q: ModelBuilder<any>) => void,
    operator = '>=',
    count = 1
  ): this {
    const rel = this._resolveRelation(relation);
    if (callback) callback(rel);

    const parentTable = this.modelClass.getTable();

    if (operator === '>=' && count === 1 && !callback) {
      this._qb.whereRaw(`EXISTS (${rel.getExistsQuery(parentTable)})`);
    } else if (callback) {
      // Compile constrained subquery
      const { sql } = rel.toSql();
      this._qb.whereRaw(`EXISTS (${sql})`);
    } else {
      this._qb.whereRaw(`(${rel.getCountQuery(parentTable)}) ${operator} ?`, [count]);
    }

    return this;
  }

  /** Constrained `WHERE NOT EXISTS`. */
  whereDoesntHave(relation: string, callback?: (q: ModelBuilder<any>) => void): this {
    const rel = this._resolveRelation(relation);
    if (callback) callback(rel);

    const { sql } = rel.toSql();
    this._qb.whereRaw(`NOT EXISTS (${sql})`);
    return this;
  }

  /** OR variant of `has()`. */
  orHas(relation: string, operator = '>=', count = 1): this {
    const rel = this._resolveRelation(relation);
    const parentTable = this.modelClass.getTable();

    if (operator === '>=' && count === 1) {
      this._qb.orWhereRaw(`EXISTS (${rel.getExistsQuery(parentTable)})`);
    } else {
      this._qb.orWhereRaw(`(${rel.getCountQuery(parentTable)}) ${operator} ?`, [count]);
    }

    return this;
  }

  /** OR variant of `whereHas()`. */
  orWhereHas(
    relation: string,
    callback?: (q: ModelBuilder<any>) => void,
    operator = '>=',
    count = 1
  ): this {
    const rel = this._resolveRelation(relation);
    if (callback) callback(rel);

    const parentTable = this.modelClass.getTable();

    if (operator === '>=' && count === 1 && !callback) {
      this._qb.orWhereRaw(`EXISTS (${rel.getExistsQuery(parentTable)})`);
    } else if (callback) {
      const { sql } = rel.toSql();
      this._qb.orWhereRaw(`EXISTS (${sql})`);
    } else {
      this._qb.orWhereRaw(`(${rel.getCountQuery(parentTable)}) ${operator} ?`, [count]);
    }

    return this;
  }

  /** OR variant of `doesntHave()`. */
  orDoesntHave(relation: string): this {
    const rel = this._resolveRelation(relation);
    const parentTable = this.modelClass.getTable();
    this._qb.orWhereRaw(`NOT EXISTS (${rel.getExistsQuery(parentTable)})`);
    return this;
  }

  /** OR variant of `whereDoesntHave()`. */
  orWhereDoesntHave(relation: string, callback?: (q: ModelBuilder<any>) => void): this {
    const rel = this._resolveRelation(relation);
    if (callback) callback(rel);

    const { sql } = rel.toSql();
    this._qb.orWhereRaw(`NOT EXISTS (${sql})`);
    return this;
  }

  /**
   * Constrained existence check on a polymorphic `morphTo` relation.
   * Builds a `WHERE EXISTS` for each specified type.
   *
   * @param relation - The `morphTo` relation method name on this model.
   * @param types    - One class, an array of classes, or `'*'` for all MorphMap entries.
   * @param callback - Optional constraints applied to each related type's query.
   *
   * @example
   * ```ts
   * // Comments attached to any type
   * Comment.whereHasMorph('commentable', '*').get()
   *
   * // Comments attached to Post or Video
   * Comment.whereHasMorph('commentable', [Post, Video]).get()
   *
   * // Comments on Posts where published = true
   * Comment.whereHasMorph('commentable', [Post], (q) => q.where('published', true)).get()
   * ```
   */
  whereHasMorph(
    relation: string,
    types: (new () => any) | (new () => any)[] | '*',
    callback?: (q: ModelBuilder<any>, type: string) => void
  ): this {
    return this._applyMorphExistence(relation, types, callback, false);
  }

  /** `WHERE NOT EXISTS` variant of `whereHasMorph`. */
  whereDoesntHaveMorph(
    relation: string,
    types: (new () => any) | (new () => any)[] | '*',
    callback?: (q: ModelBuilder<any>, type: string) => void
  ): this {
    return this._applyMorphExistence(relation, types, callback, true);
  }

  private _applyMorphExistence(
    relation: string,
    types: (new () => any) | (new () => any)[] | '*',
    callback: ((q: ModelBuilder<any>, type: string) => void) | undefined,
    negate: boolean
  ): this {
    const dummy = new (this.modelClass as any)();
    const method = (dummy as any)[relation];
    if (typeof method !== 'function') {
      throw new Error(
        `[orion] Relation "${relation}" not found on model "${(this.modelClass as any).name}".`
      );
    }
    const rel = method.call(dummy);

    // Duck-type check for MorphTo (avoids circular import from MorphTo → Relation → ModelBuilder)
    const morphTypeName = (rel as any).morphTypeName as string | undefined;
    const morphIdName = (rel as any).morphIdName as string | undefined;
    if (!morphTypeName || !morphIdName) {
      throw new Error(
        `[orion] "${relation}" must return a morphTo relation for whereHasMorph / whereDoesntHaveMorph.`
      );
    }

    const parentTable = this.modelClass.getTable();

    const typeAliases: string[] =
      types === '*'
        ? MorphMap.allAliases()
        : (Array.isArray(types) ? types : [types]).map((t: any) => MorphMap.getAlias(t));

    if (typeAliases.length === 0) {
      this._qb.whereRaw(negate ? '1 = 1' : '1 = 0');
      return this;
    }

    if (negate) {
      // whereDoesntHaveMorph: NOT EXISTS for each type (AND-combined)
      for (const alias of typeAliases) {
        const RelatedClass = MorphMap.resolve(alias);
        if (!RelatedClass) continue;
        const cfg = ModelMetadata.get(RelatedClass);
        const relatedTable = (RelatedClass as any).getTable();

        if (callback) {
          const conn = ConnectionManager.getConnection(cfg.connection ?? undefined);
          const qb = new ModelBuilder(RelatedClass as any, conn);
          qb.whereRaw(`"${relatedTable}"."${cfg.primaryKey}" = "${parentTable}"."${morphIdName}"`);
          qb.whereRaw(`"${parentTable}"."${morphTypeName}" = ?`, [alias]);
          callback(qb, alias);
          const { sql, bindings } = qb.toSql();
          this._qb.whereRaw(`NOT EXISTS (${sql})`, bindings);
        } else {
          this._qb.whereRaw(
            `NOT EXISTS (SELECT 1 FROM "${relatedTable}" WHERE "${relatedTable}"."${cfg.primaryKey}" = "${parentTable}"."${morphIdName}" AND "${parentTable}"."${morphTypeName}" = ?)`,
            [alias]
          );
        }
      }
    } else {
      // whereHasMorph: EXISTS for each type (OR-combined)
      const parts: string[] = [];
      const allBindings: unknown[] = [];

      for (const alias of typeAliases) {
        const RelatedClass = MorphMap.resolve(alias);
        if (!RelatedClass) continue;
        const cfg = ModelMetadata.get(RelatedClass);
        const relatedTable = (RelatedClass as any).getTable();

        if (callback) {
          const conn = ConnectionManager.getConnection(cfg.connection ?? undefined);
          const qb = new ModelBuilder(RelatedClass as any, conn);
          qb.whereRaw(`"${relatedTable}"."${cfg.primaryKey}" = "${parentTable}"."${morphIdName}"`);
          qb.whereRaw(`"${parentTable}"."${morphTypeName}" = ?`, [alias]);
          callback(qb, alias);
          const { sql, bindings } = qb.toSql();
          parts.push(`EXISTS (${sql})`);
          allBindings.push(...(bindings as unknown[]));
        } else {
          parts.push(
            `EXISTS (SELECT 1 FROM "${relatedTable}" WHERE "${relatedTable}"."${cfg.primaryKey}" = "${parentTable}"."${morphIdName}" AND "${parentTable}"."${morphTypeName}" = ?)`
          );
          allBindings.push(alias);
        }
      }

      if (parts.length === 0) {
        this._qb.whereRaw('1 = 0');
      } else {
        this._qb.whereRaw('(' + parts.join(' OR ') + ')', allBindings);
      }
    }

    return this;
  }

  /**
   * Add `COUNT(*)` subqueries for the given relations to the SELECT list.
   * Results are available as `{relation}_count` on each model.
   *
   * @example
   * ```ts
   * const posts = await Post.withCount('comments').get();
   * posts.first()?.getRelation<number>('comments_count');
   * ```
   */
  withCount(relations: string | string[]): this {
    const rels = Array.isArray(relations) ? relations : [relations];
    const parentTable = this.modelClass.getTable();

    for (const name of rels) {
      const rel = this._resolveRelation(name);
      const sql = rel.getCountQuery(parentTable);
      this._qb.selectRaw(`(${sql}) AS "${name}_count"`);
    }

    return this;
  }

  /**
   * Add a `SUM(column)` subquery for the given relation.
   * Result is available as `{relation}_sum_{column}` (or custom alias).
   *
   * @example
   * ```ts
   * const posts = await Post.withSum('comments', 'votes').get();
   * posts.first()?.getRelation<number>('comments_sum_votes');
   * ```
   */
  withSum(relation: string, column: string, alias?: string): this {
    return this._withAggregate(relation, 'SUM', column, alias ?? `${relation}_sum_${column}`);
  }

  /** Add a `MIN(column)` subquery for the given relation. */
  withMin(relation: string, column: string, alias?: string): this {
    return this._withAggregate(relation, 'MIN', column, alias ?? `${relation}_min_${column}`);
  }

  /** Add a `MAX(column)` subquery for the given relation. */
  withMax(relation: string, column: string, alias?: string): this {
    return this._withAggregate(relation, 'MAX', column, alias ?? `${relation}_max_${column}`);
  }

  /** Add an `AVG(column)` subquery for the given relation. */
  withAvg(relation: string, column: string, alias?: string): this {
    return this._withAggregate(relation, 'AVG', column, alias ?? `${relation}_avg_${column}`);
  }

  /**
   * Add a boolean EXISTS subquery for the given relation.
   * Result is available as `{relation}_exists` (or custom alias).
   *
   * @example
   * ```ts
   * const posts = await Post.withExists('comments').get();
   * posts.first()?.getRelation<boolean>('comments_exists');
   * ```
   */
  withExists(relation: string, alias?: string): this {
    const rel = this._resolveRelation(relation);
    const parentTable = this.modelClass.getTable();
    const as = alias ?? `${relation}_exists`;
    const sql = rel.getExistsQuery(parentTable);
    this._qb.selectRaw(`CASE WHEN EXISTS (${sql}) THEN TRUE ELSE FALSE END AS "${as}"`);
    return this;
  }

  private _withAggregate(relation: string, fn: string, column: string, alias: string): this {
    const rel = this._resolveRelation(relation);
    const parentTable = this.modelClass.getTable();
    const sql = rel.getAggregateQuery(parentTable, fn, column);
    this._qb.selectRaw(`(${sql}) AS "${alias}"`);
    return this;
  }

  /**
   * Shorthand for `whereHas(relation, q => q.where(column, value))`.
   *
   * @example
   * ```ts
   * Post.whereRelation('comments', 'approved', true).get()
   * ```
   */
  whereRelation(relation: string, column: string, operatorOrValue: unknown, value?: unknown): this {
    return this.whereHas(relation, (q) => {
      if (value !== undefined) {
        q.where(column, operatorOrValue, value);
      } else {
        q.where(column, operatorOrValue);
      }
    });
  }

  /**
   * OR variant of `whereRelation`.
   */
  orWhereRelation(
    relation: string,
    column: string,
    operatorOrValue: unknown,
    value?: unknown
  ): this {
    const rel = this._resolveRelation(relation);
    if (value !== undefined) {
      rel.where(column, operatorOrValue, value);
    } else {
      rel.where(column, operatorOrValue);
    }
    const { sql } = rel.toSql();
    this._qb.orWhereRaw(`EXISTS (${sql})`);
    return this;
  }

  /**
   * Filter to models that are attached to `model` via the named BelongsToMany relation.
   *
   * @example
   * ```ts
   * // All roles that are attached to $user
   * await Role.query().whereAttachedTo('users', user).get();
   * ```
   */
  whereAttachedTo(relation: string, model: import('./Model').Model): this {
    const rel = this._resolveRelation(relation) as any;
    if (!rel.pivotTable) {
      throw new Error(`[orion] whereAttachedTo: "${relation}" must be a BelongsToMany relation.`);
    }
    const pk: string = (model.constructor as any).getPrimaryKey?.() ?? 'id';
    const parentId = (model as any)._attributes[pk];
    this._qb.whereRaw(
      `EXISTS (SELECT 1 FROM "${rel.pivotTable}" WHERE "${rel.pivotTable}"."${rel.relatedPivotKey}" = "${this.modelClass.getTable()}"."${rel.relatedKey}" AND "${rel.pivotTable}"."${rel.foreignPivotKey}" = ?)`,
      [parentId]
    );
    return this;
  }

  /** OR variant of `whereAttachedTo`. */
  orWhereAttachedTo(relation: string, model: import('./Model').Model): this {
    const rel = this._resolveRelation(relation) as any;
    if (!rel.pivotTable) {
      throw new Error(`[orion] orWhereAttachedTo: "${relation}" must be a BelongsToMany relation.`);
    }
    const pk: string = (model.constructor as any).getPrimaryKey?.() ?? 'id';
    const parentId = (model as any)._attributes[pk];
    this._qb.orWhereRaw(
      `EXISTS (SELECT 1 FROM "${rel.pivotTable}" WHERE "${rel.pivotTable}"."${rel.relatedPivotKey}" = "${this.modelClass.getTable()}"."${rel.relatedKey}" AND "${rel.pivotTable}"."${rel.foreignPivotKey}" = ?)`,
      [parentId]
    );
    return this;
  }

  /**
   * Filter to models whose morph relation points to the given `model`.
   *
   * @example
   * ```ts
   * // Comments where commentable is a specific Post
   * await Comment.whereMorphedTo('commentable', post).get();
   * ```
   */
  whereMorphedTo(relation: string, model: import('./Model').Model): this {
    const dummy = new (this.modelClass as any)();
    const rel = (dummy as any)[relation]?.();
    if (!rel?.morphTypeName) {
      throw new Error(`[orion] whereMorphedTo: "${relation}" must be a morphTo relation.`);
    }
    const alias = MorphMap.getAlias(model.constructor as any);
    const pk: string = (model.constructor as any).getPrimaryKey?.() ?? 'id';
    const id = (model as any)._attributes[pk];
    this._qb.where(rel.morphTypeName, alias).where(rel.morphIdName, id);
    return this;
  }

  /**
   * OR variant of `whereMorphedTo`.
   *
   * @example
   * ```ts
   * await Comment.whereMorphedTo('commentable', post)
   *   .orWhereMorphedTo('commentable', video).get();
   * ```
   */
  orWhereMorphedTo(relation: string, model: import('./Model').Model): this {
    const dummy = new (this.modelClass as any)();
    const rel = (dummy as any)[relation]?.();
    if (!rel?.morphTypeName) {
      throw new Error(`[orion] orWhereMorphedTo: "${relation}" must be a morphTo relation.`);
    }
    const alias = MorphMap.getAlias(model.constructor as any);
    const pk: string = (model.constructor as any).getPrimaryKey?.() ?? 'id';
    const id = (model as any)._attributes[pk];
    this._qb.orWhere((q: any) => {
      q.where(rel.morphTypeName, alias).where(rel.morphIdName, id);
    });
    return this;
  }

  /** `WHERE NOT` variant of `whereMorphedTo`. */
  whereNotMorphedTo(relation: string, model: import('./Model').Model): this {
    const dummy = new (this.modelClass as any)();
    const rel = (dummy as any)[relation]?.();
    if (!rel?.morphTypeName) {
      throw new Error(`[orion] whereNotMorphedTo: "${relation}" must be a morphTo relation.`);
    }
    const alias = MorphMap.getAlias(model.constructor as any);
    const pk: string = (model.constructor as any).getPrimaryKey?.() ?? 'id';
    const id = (model as any)._attributes[pk];
    this._qb.whereRaw(
      `NOT ("${this.modelClass.getTable()}"."${rel.morphTypeName}" = ? AND "${this.modelClass.getTable()}"."${rel.morphIdName}" = ?)`,
      [alias, id]
    );
    return this;
  }

  /**
   * `whereHasMorph` variant that also accepts a column filter on the related table.
   *
   * @example
   * ```ts
   * Comment.whereMorphRelation('commentable', [Post], 'published', true).get()
   * ```
   */
  whereMorphRelation(
    relation: string,
    types: (new () => any) | (new () => any)[] | '*',
    column: string,
    operatorOrValue: unknown,
    value?: unknown
  ): this {
    return this.whereHasMorph(relation, types, (q) => {
      value !== undefined
        ? q.where(column, operatorOrValue, value)
        : q.where(column, operatorOrValue);
    });
  }

  /** OR variant of `whereMorphRelation`. */
  orWhereMorphRelation(
    relation: string,
    types: (new () => any) | (new () => any)[] | '*',
    column: string,
    operatorOrValue: unknown,
    value?: unknown
  ): this {
    return this.whereHasMorph(relation, types, (q) => {
      value !== undefined
        ? q.where(column, operatorOrValue, value)
        : q.where(column, operatorOrValue);
    });
  }

  /**
   * Filter to models that belong to the given parent via the named `belongsTo`
   * (or `belongsToMany`) relation.
   *
   * When passed a `Model` instance, the FK column and owner key are resolved
   * from the relation definition. When passed a `ModelCollection`, all matching
   * rows for any of the collection members are returned.
   *
   * @param relation  - Name of the `belongsTo` relation on this model.
   * @param model     - Parent model instance or collection to match against.
   *
   * @example
   * ```ts
   * // All posts that belong to a specific user
   * await Post.whereBelongsTo('author', user).get();
   *
   * // Posts belonging to any user in a collection
   * await Post.whereBelongsTo('author', users).get();
   * ```
   */
  whereBelongsTo(
    relation: string,
    model: import('./Model').Model | import('./ModelCollection').ModelCollection<any>
  ): this {
    const rel = this._resolveRelation(relation) as any;
    // foreignKey = the FK column on this model; ownerKey = PK on the related model
    const fk: string = rel.foreignKey ?? rel.localKey;
    const ownerKey: string = rel.ownerKey ?? 'id';

    if ((model as any).modelKeys) {
      // It's a ModelCollection — use whereIn
      const ids = (model as import('./ModelCollection').ModelCollection<any>).map(
        (m: any) => m._attributes[ownerKey]
      );
      this.whereIn(fk, ids);
    } else {
      const id = (model as any)._attributes[ownerKey];
      this.where(fk, id);
    }
    return this;
  }

  /**
   * OR variant of `whereBelongsTo`.
   */
  orWhereBelongsTo(
    relation: string,
    model: import('./Model').Model | import('./ModelCollection').ModelCollection<any>
  ): this {
    const rel = this._resolveRelation(relation) as any;
    const fk: string = rel.foreignKey ?? rel.localKey;
    const ownerKey: string = rel.ownerKey ?? 'id';

    if ((model as any).modelKeys) {
      const ids = (model as import('./ModelCollection').ModelCollection<any>).map(
        (m: any) => m._attributes[ownerKey]
      );
      this._qb.orWhereIn(fk, ids);
    } else {
      const id = (model as any)._attributes[ownerKey];
      this._qb.orWhere(fk, id);
    }
    return this;
  }

  /**
   * Eager-load relations onto an already-fetched collection of models.
   * Useful after retrieving models via raw queries or secondary lookups.
   *
   * @example
   * ```ts
   * const users = await User.all();
   * await User.query().loadModels(users.toArray() as Model[], 'posts');
   * ```
   */
  async loadModels(
    models: import('./Model').Model[],
    relations: string | string[] | Record<string, EagerConstraint>
  ): Promise<void> {
    if (models.length === 0) return;
    const map: EagerLoadMap = new Map();
    if (typeof relations === 'string') {
      map.set(relations, null);
    } else if (Array.isArray(relations)) {
      for (const r of relations) map.set(r, null);
    } else {
      for (const [r, fn] of Object.entries(relations)) map.set(r, fn);
    }
    await EagerLoader.load(models, map, this.modelClass);
  }

  /** @internal Instantiate a relation from the model class for introspection. */
  private _resolveRelation(name: string): import('./relations/Relation').Relation<any> {
    const dummy = new (this.modelClass as any)();

    // Check dynamic relations registered via resolveRelationUsing first
    const cfg =
      (this.modelClass as any).config?.() ??
      require('./ModelMetadata').ModelMetadata.get(this.modelClass);
    const dynRelations = cfg?.dynamicRelations as Map<string, (m: any) => any> | undefined;
    if (dynRelations?.has(name)) {
      return dynRelations.get(name)!(dummy);
    }

    const method = dummy[name];

    if (typeof method !== 'function') {
      throw new Error(
        `[orion] Relation "${name}" not found on model "${(this.modelClass as any).name}".`
      );
    }

    const rel = method.call(dummy);

    if (!rel || typeof rel.getExistsQuery !== 'function') {
      throw new Error(`[orion] "${name}()" must return a Relation instance.`);
    }

    return rel;
  }

  /**
   * Override or add cast types for every model hydrated by this query.
   * Useful when a query returns columns with different types than the class default,
   * or when using raw `selectRaw` columns that need explicit casting.
   *
   * @example
   * ```ts
   * const products = await Product.withCasts({ price: MoneyCast }).get();
   * // Each product.price is a Money instance, regardless of the class @casts.
   * ```
   */
  withCasts(casts: Record<string, import('./ModelMetadata').CastType>): this {
    this._extraCasts = { ...this._extraCasts, ...casts };
    return this;
  }

  lockForUpdate(): this {
    this._qb.lockForUpdate();
    return this;
  }

  sharedLock(): this {
    this._qb.sharedLock();
    return this;
  }

  // ── PAGINATION ────────────────────────────────────────────────────────────

  /**
   * Paginate the query results.
   * Runs **two** queries: one `COUNT(*)` for the total and one `SELECT` with
   * `LIMIT` / `OFFSET` for the page data.
   *
   * @param perPage     - Number of rows per page (default: 15).
   * @param currentPage - Page number, 1-based (default: 1).
   *
   * @example
   * ```ts
   * const page = await User.where('active', true).paginate(15, 2);
   *
   * page.data          // ModelCollection<User> — page 2
   * page.total         // total rows matching the WHERE
   * page.lastPage      // Math.ceil(total / perPage)
   * page.hasMorePages  // currentPage < lastPage
   * ```
   */
  async paginate(perPage = 15, currentPage = 1): Promise<Paginator<T>> {
    // Apply scopes once; clone so we don't mutate the original builder
    this._applyGlobalScopes();

    // COUNT query — strip ORDER BY and run on a clean clone
    const countBuilder = this.clone();
    const total = await countBuilder._qb.count();

    // Data query
    const offset = (currentPage - 1) * perPage;
    const dataBuilder = this.clone();
    dataBuilder._qb.limit(perPage).offset(offset);
    const data = await dataBuilder.get();

    return new Paginator(data, total, perPage, currentPage);
  }

  /**
   * Paginate without a total count — faster for large tables.
   * Fetches `perPage + 1` rows; if more than `perPage` are returned, there is
   * a next page (and the extra row is stripped from `data`).
   *
   * @param perPage     - Number of rows per page (default: 15).
   * @param currentPage - Page number, 1-based (default: 1).
   *
   * @example
   * ```ts
   * const page = await User.simplePaginate(15);
   *
   * page.data          // ModelCollection<User>
   * page.hasMorePages  // true/false — no total count
   * ```
   */
  async simplePaginate(perPage = 15, currentPage = 1): Promise<SimplePaginator<T>> {
    this._applyGlobalScopes();

    const offset = (currentPage - 1) * perPage;
    const dataBuilder = this.clone();
    dataBuilder._qb.limit(perPage + 1).offset(offset);

    const rows = await dataBuilder.get();
    const hasMorePages = rows.length > perPage;

    // Strip the look-ahead row if present
    const data = hasMorePages
      ? new ModelCollection([...rows].slice(0, perPage), this.modelClass as any)
      : rows;

    return new SimplePaginator(data as ModelCollection<T>, perPage, currentPage, hasMorePages);
  }

  // ── AGGREGATES ────────────────────────────────────────────────────────────

  async count(column = '*'): Promise<number> {
    this._applyGlobalScopes();
    return this._qb.count(column);
  }

  async sum(column: string): Promise<number> {
    this._applyGlobalScopes();
    return this._qb.sum(column);
  }

  async min(column: string): Promise<number> {
    this._applyGlobalScopes();
    return this._qb.min(column);
  }

  async max(column: string): Promise<number> {
    this._applyGlobalScopes();
    return this._qb.max(column);
  }

  async avg(column: string): Promise<number> {
    this._applyGlobalScopes();
    return this._qb.avg(column);
  }

  async exists(): Promise<boolean> {
    this._applyGlobalScopes();
    return this._qb.exists();
  }

  async doesntExist(): Promise<boolean> {
    this._applyGlobalScopes();
    return this._qb.doesntExist();
  }

  // ── READ TERMINALS ────────────────────────────────────────────────────────

  /** Execute the query and return a typed `ModelCollection<T>`. */
  async get(): Promise<ModelCollection<T>> {
    this._applyGlobalScopes();
    const rows = await this._qb.get();
    const models = new ModelCollection<T>(
      rows.map((row) => this.hydrate(row)),
      this.modelClass as any
    );

    if (this._eagerLoads.size > 0) {
      await EagerLoader.load(models.toArray() as any[], this._eagerLoads, this.modelClass);
    }

    return models;
  }

  /** Return the first matching model instance, or `null`. */
  async first(): Promise<T | null> {
    const clone = this.clone();
    clone._applyGlobalScopes();
    clone._qb.limit(1);
    const rows = await clone._qb.get();
    return rows[0] ? this.hydrate(rows[0]) : null;
  }

  /** Return the first matching instance, or execute `callback` if none found. */
  async firstOr<U>(callback: () => U | Promise<U>): Promise<T | U> {
    const instance = await this.first();
    return instance ?? callback();
  }

  /** Return the first matching instance or throw if none found. */
  async firstOrFail(): Promise<T> {
    const instance = await this.first();
    if (!instance) {
      throw new Error(`[orion] No query results for model [${(this.modelClass as any).name}].`);
    }
    return instance;
  }

  /** Find a model by primary key, or `null`. */
  async find(id: unknown, columns: string[] = ['*']): Promise<T | null> {
    return this.clone()
      .where(this.modelClass.getPrimaryKey(), id)
      .select(...columns)
      .first();
  }

  /** Find by primary key or throw. */
  async findOrFail(id: unknown, columns: string[] = ['*']): Promise<T> {
    const instance = await this.find(id, columns);
    if (!instance) {
      throw new Error(
        `[orion] No query results for model [${(this.modelClass as any).name}] with key ${id}.`
      );
    }
    return instance;
  }

  /** Find by primary key, or execute `callback` if not found. */
  async findOr<U>(id: unknown, callback: () => U | Promise<U>): Promise<T | U> {
    const instance = await this.find(id);
    return instance ?? callback();
  }

  /** Return a single column value from the first row. */
  async value(column: string): Promise<unknown> {
    this._applyGlobalScopes();
    return this._qb.value(column);
  }

  /** Return an array of values for a single column across all rows. */
  async pluck(column: string): Promise<unknown[]> {
    this._applyGlobalScopes();
    return this._qb.pluck(column);
  }

  /**
   * Execute `callback` for each chunk of `size` model instances.
   */
  async chunk(
    size: number,
    callback: (items: Collection<T>) => Promise<boolean | void> | boolean | void
  ): Promise<void> {
    let page = 1;
    while (true) {
      const items = await this.clone().forPage(page, size).get();
      if (items.isEmpty()) break;
      const result = await callback(items);
      if (result === false) break;
      if (items.length < size) break;
      page++;
    }
  }

  /** Async generator that yields one model instance at a time. */
  async *cursor(): AsyncGenerator<T> {
    this._applyGlobalScopes();
    for await (const row of this._qb.cursor()) {
      yield this.hydrate(row);
    }
  }

  /**
   * Like `chunk`, but orders and pages by primary key (or `column`) for safe,
   * stable iteration even when rows are modified inside the callback.
   */
  async chunkById(
    size: number,
    callback: (items: Collection<T>) => Promise<boolean | void> | boolean | void,
    column?: string
  ): Promise<void> {
    const pk = column ?? this.modelClass.getPrimaryKey();
    let lastId: unknown = null;
    while (true) {
      const query = this.clone().orderBy(pk, 'asc').limit(size);
      if (lastId !== null) query.where(pk, '>', lastId);
      const items = await query.get();
      if (items.isEmpty()) break;
      const result = await callback(items);
      if (result === false) break;
      lastId = (items.last() as any)._attributes[pk];
      if (items.length < size) break;
    }
  }

  /**
   * Async generator that yields batches of `size` models, keyed by `column` (default PK).
   * Uses cursor-style pagination — safe for large tables.
   */
  async *lazy(size = 1000): AsyncGenerator<T> {
    let page = 1;
    while (true) {
      const items = await this.clone().forPage(page, size).get();
      for (const item of items) yield item;
      if (items.length < size) break;
      page++;
    }
  }

  /**
   * Like `lazy`, but pages by primary key (or `column`) for stable iteration.
   */
  async *lazyById(size = 1000, column?: string): AsyncGenerator<T> {
    const pk = column ?? this.modelClass.getPrimaryKey();
    let lastId: unknown = null;
    while (true) {
      const query = this.clone().orderBy(pk, 'asc').limit(size);
      if (lastId !== null) query.where(pk, '>', lastId);
      const items = await query.get();
      for (const item of items) yield item;
      if (items.isEmpty()) break;
      lastId = (items.last() as any)._attributes[pk];
      if (items.length < size) break;
    }
  }

  // ── WRITE PASSTHROUGH ─────────────────────────────────────────────────────

  async insert(values: Record<string, unknown> | Record<string, unknown>[]): Promise<number> {
    return this._qb.insert(values);
  }

  async insertGetId(values: Record<string, unknown>): Promise<unknown> {
    return this._qb.insertGetId(values);
  }

  async update(values: Record<string, unknown>): Promise<number> {
    this._applyGlobalScopes();
    return this._qb.update(values);
  }

  async increment(
    column: string,
    amount = 1,
    extra: Record<string, unknown> = {}
  ): Promise<number> {
    this._applyGlobalScopes();
    return this._qb.increment(column, amount, extra);
  }

  async decrement(
    column: string,
    amount = 1,
    extra: Record<string, unknown> = {}
  ): Promise<number> {
    this._applyGlobalScopes();
    return this._qb.decrement(column, amount, extra);
  }

  async delete(): Promise<number> {
    this._applyGlobalScopes();
    return this._qb.delete();
  }

  async truncate(): Promise<void> {
    return this._qb.truncate();
  }

  async upsert(
    values: Record<string, unknown>[],
    uniqueBy: string[],
    updateColumns: string[]
  ): Promise<number> {
    return this._qb.upsert(values, uniqueBy, updateColumns);
  }

  // ── INTROSPECTION ─────────────────────────────────────────────────────────

  /** Compile and return the SQL without executing (scopes NOT applied). */
  toSql(): { sql: string; bindings: unknown[] } {
    return this._qb.toSql();
  }

  /** Print the compiled SQL to stdout and return `this`. */
  dump(): this {
    this._qb.dump();
    return this;
  }

  /** Create a deep copy of this builder (scopes and flags are preserved). */
  clone(): ModelBuilder<T> {
    const copy = new ModelBuilder<T>(
      this.modelClass,
      (this._qb as any).connection,
      (this._qb as any).grammar
    );
    copy._qb = this._qb.clone();
    copy._removedScopes = new Set(this._removedScopes);
    copy._withTrashed = this._withTrashed;
    copy._onlyTrashed = this._onlyTrashed;
    copy._eagerLoads = new Map(this._eagerLoads);
    (copy as any)._extraCasts = { ...this._extraCasts };
    return copy;
  }

  // ── Hydration ─────────────────────────────────────────────────────────────

  private hydrate(row: Record<string, unknown>): T {
    const model = this.modelClass.hydrate(row);
    if (Object.keys(this._extraCasts).length > 0) {
      (model as any)._instanceCasts = {
        ...(model as any)._instanceCasts,
        ...this._extraCasts,
      };
    }
    return model;
  }
}
