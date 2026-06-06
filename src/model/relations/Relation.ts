import type { Model } from '../Model';
import { ModelBuilder, ModelConstructor } from '../ModelBuilder';
import { Collection } from '../Collection';
import { ConnectionManager } from '../../connection/ConnectionManager';
import { ModelMetadata } from '../ModelMetadata';
import { LazyLoadingViolationError } from '../../errors/LazyLoadingViolationError';

// Re-export so relation files have one import point
export type { ModelConstructor };

/**
 * The abstract base for all relationship types.
 *
 * Extends `ModelBuilder<TRelated>` so every relation is also a fully-featured
 * query builder — you can chain `where`, `orderBy`, `limit`, etc. on any relation:
 *
 * ```ts
 * const recent = await user.posts().where('active', true).latest().limit(5).get();
 * ```
 *
 * Subclasses implement four hooks used by the eager-loading system:
 * - `getResults()` — lazy-load result for a single parent
 * - `addEagerConstraints()` — narrow the query to a set of parent ids
 * - `initRelation()` — set the default empty value on parents before matching
 * - `match()` — distribute loaded results back to each parent model
 * - `getExistsQuery()` — correlated SQL for `has()` / `whereHas()` subqueries
 */
export abstract class Relation<TRelated extends object> extends ModelBuilder<TRelated> {
  /** The parent model instance that owns this relation. */
  protected readonly parent: Model;
  /** FK column name used to join parent ↔ related. Varies by relation type. */
  readonly foreignKey: string;
  /** Local key on the parent (or related) table. Varies by relation type. */
  readonly localKey: string;

  constructor(
    relatedClass: ModelConstructor<TRelated>,
    parent: Model,
    foreignKey: string,
    localKey: string
  ) {
    const cfg = ModelMetadata.resolve(parent);
    const connection = ConnectionManager.getConnection(cfg.connection ?? undefined);
    super(relatedClass, connection);
    this.parent = parent;
    this.foreignKey = foreignKey;
    this.localKey = localKey;
  }

  // ── Hooks for EagerLoader ─────────────────────────────────────────────────

  /** Execute the relation query for a single parent and return the result. */
  abstract getResults(): Promise<Collection<TRelated> | TRelated | null>;

  /**
   * Narrow the query to only related models belonging to the given `parents`.
   * Called once per eager load batch, before executing the query.
   */
  abstract addEagerConstraints(parents: Model[]): void;

  /**
   * Set an empty default value on each parent model before matching starts.
   * Ensures the property is always present even when no related records exist.
   */
  abstract initRelation(parents: Model[], relation: string): Model[];

  /**
   * Match each loaded related model to its parent and store it in `_relations`.
   * Returns the same `parents` array with `_relations[relation]` populated.
   */
  abstract match(parents: Model[], results: Collection<TRelated>, relation: string): Model[];

  /**
   * Return a correlated SQL fragment used inside `WHERE EXISTS (...)` or
   * `WHERE NOT EXISTS (...)` when calling `has()` / `whereHas()`.
   *
   * The fragment should reference the parent table alias so the subquery
   * correlates correctly, e.g.:
   * `SELECT 1 FROM "comments" WHERE "comments"."post_id" = "posts"."id"`
   */
  abstract getExistsQuery(parentTable: string): string;

  /**
   * Return a correlated COUNT(*) SQL fragment for `withCount()`.
   * e.g. `SELECT COUNT(*) FROM "comments" WHERE "comments"."post_id" = "posts"."id"`
   */
  abstract getCountQuery(parentTable: string): string;

  /**
   * Return a correlated aggregate SQL fragment for `withSum / withMin / withMax / withAvg`.
   * Default implementation replaces `COUNT(*)` in `getCountQuery()` with the given function.
   * Subclasses that need a different structure should override this method.
   */
  getAggregateQuery(parentTable: string, fn: string, column: string): string {
    return this.getCountQuery(parentTable).replace('COUNT(*)', `${fn.toUpperCase()}("${column}")`);
  }

  // ── Helpers available to all subclasses ───────────────────────────────────

  /**
   * Throw if `Model.preventLazyLoading()` is active.
   * Call at the top of each concrete `getResults()` implementation.
   */
  protected _checkLazyLoading(): void {
    if (ModelMetadata.preventLazyLoading) {
      throw new LazyLoadingViolationError(
        this.parent.constructor.name,
        (this.modelClass as any).name
      );
    }
  }

  /**
   * Return a copy of this relation pre-scoped with the given attribute values.
   *
   * When `asConditions` is `true` (default), the values are applied as WHERE
   * clauses so only matching related records are returned.
   * When `false`, the values are set on newly created related models but do
   * not narrow the query.
   *
   * @example
   * ```ts
   * // Only published posts
   * user.posts().withAttributes({ status: 'published' }).get()
   *
   * // New posts default to status='draft', but query is not narrowed
   * user.posts().withAttributes({ status: 'draft' }, false).create({ title: 'Hi' })
   * ```
   */
  withAttributes(attrs: Record<string, unknown>, asConditions = true): this {
    if (asConditions) {
      for (const [key, value] of Object.entries(attrs)) {
        this.where(key, value);
      }
    }
    // Store for use in save/create operations
    (this as any)._scopedAttributes = {
      ...((this as any)._scopedAttributes ?? {}),
      ...attrs,
    };
    return this;
  }

  /** Get the value of the parent's local key. */
  protected getParentKey(): unknown {
    return (this.parent as any)._attributes[this.localKey];
  }

  /** Collect all values of `keyName` from an array of models, deduped. */
  protected collectKeys(models: Model[], keyName: string): unknown[] {
    const seen = new Set<unknown>();
    const keys: unknown[] = [];
    for (const m of models) {
      const val = (m as any)._attributes[keyName];
      if (val !== undefined && val !== null && !seen.has(val)) {
        seen.add(val);
        keys.push(val);
      }
    }
    return keys;
  }
}
