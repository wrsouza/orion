import type { Model } from '../Model';
import { Collection } from '../Collection';
import { Relation, ModelConstructor } from './Relation';
import { MorphMap } from '../MorphMap';

/**
 * Represents a polymorphic one-to-one relationship.
 *
 * The related model's table has two columns:
 *   `{morphName}_type` — stores the parent model's class alias (e.g. `'User'`)
 *   `{morphName}_id`   — stores the parent model's primary key
 *
 * @example
 * ```ts
 * class User extends Model {
 *   image(): MorphOne<Image> {
 *     return this.morphOne(Image, 'imageable');
 *     // Queries: WHERE imageable_type = 'User' AND imageable_id = ?
 *   }
 * }
 * ```
 */
export class MorphOne<TRelated extends object> extends Relation<TRelated> {
  protected readonly morphType: string;
  protected readonly morphId: string;
  protected readonly morphClass: string;

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

  async getResults(): Promise<TRelated | null> {
    this._checkLazyLoading();
    this.where(this.morphType, this.morphClass);
    this.where(this.morphId, this.getParentKey());
    return this.first();
  }

  // ── Eager load hooks ──────────────────────────────────────────────────────

  addEagerConstraints(parents: Model[]): void {
    const keys = this.collectKeys(parents, this.localKey);
    this._qb.where(this.morphType, this.morphClass);
    this._qb.whereIn(this.morphId, keys);
  }

  initRelation(parents: Model[], relation: string): Model[] {
    for (const parent of parents) {
      (parent as any)._relations[relation] = null;
    }
    return parents;
  }

  match(parents: Model[], results: Collection<TRelated>, relation: string): Model[] {
    const dict = new Map<unknown, TRelated>();
    for (const related of results) {
      const key = (related as any)._attributes[this.morphId];
      if (!dict.has(key)) dict.set(key, related);
    }

    for (const parent of parents) {
      const key = (parent as any)._attributes[this.localKey];
      (parent as any)._relations[relation] = dict.get(key) ?? null;
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

  async save(model: TRelated): Promise<TRelated> {
    (model as any)[this.morphType] = this.morphClass;
    (model as any)[this.morphId] = this.getParentKey();
    await (model as any).save();
    return model;
  }

  async saveMany(models: TRelated[]): Promise<TRelated[]> {
    return Promise.all(models.map((m) => this.save(m)));
  }

  async createMany(rows: Record<string, unknown>[]): Promise<TRelated[]> {
    return Promise.all(rows.map((r) => this.create(r)));
  }
}
