import type { Model } from '../Model';
import { Collection } from '../Collection';
import { ModelCollection } from '../ModelCollection';
import { Relation, ModelConstructor } from './Relation';
import { MorphMap } from '../MorphMap';

/**
 * Represents a polymorphic one-to-many relationship.
 *
 * The related model's table has two columns:
 *   `{morphName}_type` — stores the parent model's class alias (e.g. `'Post'`)
 *   `{morphName}_id`   — stores the parent model's primary key
 *
 * @example
 * ```ts
 * class Post extends Model {
 *   comments(): MorphMany<Comment> {
 *     return this.morphMany(Comment, 'commentable');
 *     // Queries: WHERE commentable_type = 'Post' AND commentable_id = ?
 *   }
 * }
 * ```
 */
export class MorphMany<TRelated extends object> extends Relation<TRelated> {
  protected readonly morphType: string;
  protected readonly morphId: string;
  protected readonly morphClass: string;
  private _chaperone = false;

  /**
   * Enable parent back-reference on each loaded child.
   * After loading, each related model will have the parent stored in
   * `model.getRelation('parent')`.
   *
   * @example
   * ```ts
   * const comments = await post.comments().chaperone().get();
   * comments[0].getRelation<Post>('parent') // → the post
   * ```
   */
  chaperone(): this {
    this._chaperone = true;
    return this;
  }

  constructor(
    relatedClass: ModelConstructor<TRelated>,
    parent: Model,
    morphName: string,
    localKey: string
  ) {
    super(relatedClass, parent, `${morphName}_id`, localKey);
    this.morphType = `${morphName}_type`;
    this.morphId = `${morphName}_id`;
    this.morphClass = MorphMap.getAlias(parent.constructor as Function);
  }

  // ── Lazy load ─────────────────────────────────────────────────────────────

  async getResults(): Promise<Collection<TRelated>> {
    this._checkLazyLoading();
    this.where(this.morphType, this.morphClass);
    this.where(this.morphId, this.getParentKey());
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
    this._qb.where(this.morphType, this.morphClass);
    this._qb.whereIn(this.morphId, keys);
  }

  initRelation(parents: Model[], relation: string): Model[] {
    for (const parent of parents) {
      (parent as any)._relations[relation] = new ModelCollection([], this.modelClass as any);
    }
    return parents;
  }

  match(parents: Model[], results: Collection<TRelated>, relation: string): Model[] {
    const dict = new Map<unknown, TRelated[]>();
    for (const related of results) {
      const key = (related as any)._attributes[this.morphId];
      if (!dict.has(key)) dict.set(key, []);
      dict.get(key)!.push(related);
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
    return (
      `SELECT 1 FROM "${rel}" WHERE "${rel}"."${this.morphType}" = '${this.morphClass}' ` +
      `AND "${rel}"."${this.morphId}" = "${parentTable}"."${this.localKey}"`
    );
  }

  getCountQuery(parentTable: string): string {
    const rel = this.modelClass.getTable();
    return (
      `SELECT COUNT(*) FROM "${rel}" WHERE "${rel}"."${this.morphType}" = '${this.morphClass}' ` +
      `AND "${rel}"."${this.morphId}" = "${parentTable}"."${this.localKey}"`
    );
  }

  // ── Write via relation ────────────────────────────────────────────────────

  async create(attributes: Record<string, unknown>): Promise<TRelated> {
    const data = {
      ...attributes,
      [this.morphType]: this.morphClass,
      [this.morphId]: this.getParentKey(),
    };
    return (this.modelClass as any).create(data);
  }

  async createMany(rows: Record<string, unknown>[]): Promise<Collection<TRelated>> {
    const created = await Promise.all(rows.map((r) => this.create(r)));
    return new Collection(created);
  }

  async save(model: TRelated): Promise<TRelated> {
    (model as any)[this.morphType] = this.morphClass;
    (model as any)[this.morphId] = this.getParentKey();
    await (model as any).save();
    return model;
  }

  async saveMany(models: TRelated[]): Promise<TRelated[]> {
    return Promise.all(models.map((m) => this.save(m)));
  }

  async firstOrCreate(
    attributes: Record<string, unknown>,
    values: Record<string, unknown> = {}
  ): Promise<TRelated> {
    const morphClause = { [this.morphType]: this.morphClass, [this.morphId]: this.getParentKey() };
    const existing = await (this.modelClass as any)
      .where({ ...morphClause, ...attributes })
      .first();
    if (existing) return existing as TRelated;
    return this.create({ ...attributes, ...values });
  }

  async updateOrCreate(
    attributes: Record<string, unknown>,
    values: Record<string, unknown> = {}
  ): Promise<TRelated> {
    const morphClause = { [this.morphType]: this.morphClass, [this.morphId]: this.getParentKey() };
    const existing = await (this.modelClass as any)
      .where({ ...morphClause, ...attributes })
      .first();
    if (existing) {
      await (existing as any).update(values);
      return existing as TRelated;
    }
    return this.create({ ...attributes, ...values });
  }
}
