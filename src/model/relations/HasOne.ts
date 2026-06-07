import type { Model } from '../Model';
import { Collection } from '../Collection';
import { Relation } from './Relation';
import { _skipRelationConstraints } from './RelationConstraints';

/**
 * Represents a one-to-one relationship where the foreign key lives on the
 * **related** model's table.
 *
 * ```
 * users ──< profiles
 *           profiles.user_id  ← foreignKey
 * ```
 *
 * @example
 * ```ts
 * class User extends Model {
 *   profile(): HasOne<Profile> {
 *     return this.hasOne(Profile);
 *     // Infers foreignKey = 'user_id', localKey = 'id'
 *   }
 * }
 *
 * const profile = await user.profile().first();
 * const profile = await user.profile().firstOrFail();
 * ```
 */
export class HasOne<TRelated extends object> extends Relation<TRelated> {
  private _ofManyColumn: string | null = null;
  private _ofManyDirection: 'asc' | 'desc' = 'desc';

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

  // ── "Has One of Many" variants ────────────────────────────────────────────

  /**
   * Constrain the relation to the **latest** record by `column`.
   *
   * @example
   * ```ts
   * latestOrder(): HasOne<Order> {
   *   return this.hasOne(Order).latestOfMany('created_at');
   * }
   * ```
   */
  latestOfMany(column = 'id'): this {
    this._ofManyColumn = column;
    this._ofManyDirection = 'desc';
    return this;
  }

  /**
   * Constrain the relation to the **oldest** record by `column`.
   */
  oldestOfMany(column = 'id'): this {
    this._ofManyColumn = column;
    this._ofManyDirection = 'asc';
    return this;
  }

  /**
   * Constrain the relation to the record with the max or min value of `column`.
   *
   * @example
   * ```ts
   * largestOrder(): HasOne<Order> {
   *   return this.hasOne(Order).ofMany('price', 'max');
   * }
   * ```
   */
  ofMany(column: string, fn: 'max' | 'min' = 'max'): this {
    this._ofManyColumn = column;
    this._ofManyDirection = fn === 'max' ? 'desc' : 'asc';
    return this;
  }

  // ── Lazy load ─────────────────────────────────────────────────────────────

  async getResults(): Promise<TRelated | null> {
    this._checkLazyLoading();
    if (this._ofManyColumn) {
      this.orderBy(this._ofManyColumn, this._ofManyDirection);
    }
    return this.first();
  }

  // ── Eager load hooks ──────────────────────────────────────────────────────

  addEagerConstraints(parents: Model[]): void {
    const keys = this.collectKeys(parents, this.localKey);
    this.whereIn(this.foreignKey, keys);
    // For ofMany variants, order so match() picks the correct record per group
    if (this._ofManyColumn) {
      this.orderBy(this._ofManyColumn, this._ofManyDirection);
    }
  }

  initRelation(parents: Model[], relation: string): Model[] {
    for (const parent of parents) {
      (parent as any)._relations[relation] = null;
    }
    return parents;
  }

  match(parents: Model[], results: Collection<TRelated>, relation: string): Model[] {
    // Build a dictionary: related[fk] → first related
    const dict = new Map<unknown, TRelated>();
    for (const related of results) {
      const fk = (related as any)._attributes[this.foreignKey];
      if (!dict.has(fk)) dict.set(fk, related);
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
    return `SELECT 1 FROM "${rel}" WHERE "${rel}"."${this.foreignKey}" = "${parentTable}"."${this.localKey}"`;
  }

  getCountQuery(parentTable: string): string {
    const rel = this.modelClass.getTable();
    return `SELECT COUNT(*) FROM "${rel}" WHERE "${rel}"."${this.foreignKey}" = "${parentTable}"."${this.localKey}"`;
  }

  // ── Write via relation ────────────────────────────────────────────────────

  /**
   * Create and persist a new related model, setting the foreign key automatically.
   */
  async create(attributes: Record<string, unknown>): Promise<TRelated> {
    const data = { ...attributes, [this.foreignKey]: this.getParentKey() };
    return (this.modelClass as any).create(data) as Promise<TRelated>;
  }

  /**
   * Attach an existing model to this relation by saving the foreign key.
   */
  async save(model: TRelated): Promise<TRelated> {
    (model as any)[this.foreignKey] = this.getParentKey();
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
