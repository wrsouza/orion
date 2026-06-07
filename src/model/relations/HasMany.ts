import type { Model } from '../Model';
import { Collection } from '../Collection';
import { ModelCollection } from '../ModelCollection';
import { Relation } from './Relation';
import { _skipRelationConstraints } from './RelationConstraints';

/**
 * Represents a one-to-many relationship where the foreign key lives on the
 * **related** model's table.
 *
 * ```
 * posts ──< comments
 *           comments.post_id  ← foreignKey
 * ```
 *
 * @example
 * ```ts
 * class Post extends Model {
 *   comments(): HasMany<Comment> {
 *     return this.hasMany(Comment);
 *     // Infers foreignKey = 'post_id', localKey = 'id'
 *   }
 * }
 *
 * const comments = await post.comments().orderBy('created_at').get();
 * const comment  = await post.comments().create({ body: 'Great post!' });
 * ```
 */
export class HasMany<TRelated extends object> extends Relation<TRelated> {
  /** When `true`, each loaded child has its parent stored in `_relations['parent']`. */
  private _chaperone = false;

  constructor(
    relatedClass: import('../ModelBuilder').ModelConstructor<TRelated>,
    parent: import('../Model').Model,
    foreignKey: string,
    localKey: string
  ) {
    super(relatedClass, parent, foreignKey, localKey);
    if (!_skipRelationConstraints) {
      this.where(this.foreignKey, this.getParentKey());
    }
  }

  /**
   * Enable parent back-reference hydration.
   * After eager loading, each related model will have the parent model stored
   * in `model.getRelation('parent')` (i.e. `model._relations.parent`).
   *
   * This avoids extra queries when traversing a collection of children that all
   * need to reference their parent.
   *
   * @example
   * ```ts
   * const posts = await user.posts().chaperone().get();
   * posts[0].getRelation<User>('parent') // → the user
   * ```
   */
  chaperone(): this {
    this._chaperone = true;
    return this;
  }

  // ── Lazy load ─────────────────────────────────────────────────────────────

  async getResults(): Promise<Collection<TRelated>> {
    this._checkLazyLoading();
    const results = await this.get();
    if (this._chaperone) {
      for (const child of results) {
        (child as any)._relations['parent'] = this.parent;
      }
    }
    return results;
  }

  // ── Eager load hooks ──────────────────────────────────────────────────────

  addEagerConstraints(parents: Model[]): void {
    const keys = this.collectKeys(parents, this.localKey);
    this.whereIn(this.foreignKey, keys);
  }

  initRelation(parents: Model[], relation: string): Model[] {
    for (const parent of parents) {
      (parent as any)._relations[relation] = new ModelCollection([], this.modelClass as any);
    }
    return parents;
  }

  match(parents: Model[], results: Collection<TRelated>, relation: string): Model[] {
    // Group related models by their FK value
    const dict = new Map<unknown, TRelated[]>();
    for (const related of results) {
      const fk = (related as any)._attributes[this.foreignKey];
      if (!dict.has(fk)) dict.set(fk, []);
      dict.get(fk)!.push(related);
    }

    for (const parent of parents) {
      const key = (parent as any)._attributes[this.localKey];
      const children = dict.get(key) ?? [];

      if (this._chaperone) {
        for (const child of children) {
          (child as any)._relations['parent'] = parent;
        }
      }

      (parent as any)._relations[relation] = new ModelCollection(children, this.modelClass as any);
    }

    return parents;
  }

  // ── Exists / Count SQL ────────────────────────────────────────────────────

  getExistsQuery(parentTable: string): string {
    const rel = this.modelClass.getTable();
    return `SELECT 1 FROM "${rel}" WHERE "${rel}"."${this.foreignKey}" = "${parentTable}"."${this.localKey}"`;
  }

  getCountQuery(parentTable: string): string {
    const rel = this.modelClass.getTable();
    return `SELECT COUNT(*) FROM "${rel}" WHERE "${rel}"."${this.foreignKey}" = "${parentTable}"."${this.localKey}"`;
  }

  // ── Write via relation ────────────────────────────────────────────────────

  /**
   * Create and persist a new related model with the foreign key set.
   */
  async create(attributes: Record<string, unknown>): Promise<TRelated> {
    const data = {
      ...((this as any)._scopedAttributes ?? {}),
      ...attributes,
      [this.foreignKey]: this.getParentKey(),
    };
    return (this.modelClass as any).create(data) as Promise<TRelated>;
  }

  /**
   * Create multiple related models at once.
   */
  async createMany(rows: Record<string, unknown>[]): Promise<Collection<TRelated>> {
    const created = await Promise.all(rows.map((r) => this.create(r)));
    return new Collection(created);
  }

  /**
   * Persist an existing model instance, setting its foreign key to this parent.
   */
  async save(model: TRelated): Promise<TRelated> {
    (model as any)[this.foreignKey] = this.getParentKey();
    await (model as any).save();
    return model;
  }

  /**
   * Persist multiple existing model instances.
   */
  async saveMany(models: TRelated[]): Promise<TRelated[]> {
    return Promise.all(models.map((m) => this.save(m)));
  }

  /**
   * Retrieve the first related model matching `attributes`, or create it
   * with `attributes` merged with `values` and the parent FK automatically set.
   *
   * @example
   * ```ts
   * const comment = await post.comments().firstOrCreate(
   *   { body: 'Hello' },
   *   { approved: true }
   * );
   * ```
   */
  async firstOrCreate(
    attributes: Record<string, unknown>,
    values: Record<string, unknown> = {}
  ): Promise<TRelated> {
    const fkClause = { [this.foreignKey]: this.getParentKey() };
    const existing = await (this.modelClass as any)
      .where({
        ...fkClause,
        ...attributes,
      })
      .first();
    if (existing) return existing as TRelated;
    return this.create({ ...attributes, ...values });
  }

  /**
   * Update the first related model matching `attributes`, or create it.
   * The parent FK is automatically set on create.
   *
   * @example
   * ```ts
   * const comment = await post.comments().updateOrCreate(
   *   { slug: 'hello' },
   *   { body: 'Updated body' }
   * );
   * ```
   */
  async updateOrCreate(
    attributes: Record<string, unknown>,
    values: Record<string, unknown> = {}
  ): Promise<TRelated> {
    const fkClause = { [this.foreignKey]: this.getParentKey() };
    const existing = await (this.modelClass as any)
      .where({
        ...fkClause,
        ...attributes,
      })
      .first();
    if (existing) {
      await (existing as any).update(values);
      return existing as TRelated;
    }
    return this.create({ ...attributes, ...values });
  }
}
