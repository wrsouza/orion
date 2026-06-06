import type { Model } from '../Model';
import { Collection } from '../Collection';
import { ModelCollection } from '../ModelCollection';
import { Relation, ModelConstructor } from './Relation';

/**
 * Represents a one-to-many relationship through an intermediate ("through") model.
 *
 * ```
 * countries ──< users ──< posts
 * Country hasManyThrough Post through User
 *   firstKey  = users.country_id  (FK on through → parent)
 *   secondKey = posts.user_id     (FK on far    → through)
 * ```
 *
 * @example
 * ```ts
 * class Country extends Model {
 *   posts(): HasManyThrough<Post> {
 *     return this.hasManyThrough(Post, User);
 *     // firstKey  = 'country_id' (on users)
 *     // secondKey = 'user_id'    (on posts)
 *   }
 * }
 * ```
 */
export class HasManyThrough<TFar extends object> extends Relation<TFar> {
  private readonly throughTable: string;
  /** FK on the far model pointing to the through model (e.g. `user_id` on posts). */
  private readonly secondKey: string;
  /** PK of the through model (e.g. `id` on users). */
  private readonly secondLocalKey: string;

  constructor(
    farClass: ModelConstructor<TFar>,
    throughClass: ModelConstructor<any>,
    parent: Model,
    /** FK on through model → parent (e.g. `country_id` on users). */
    firstKey: string,
    secondKey: string,
    localKey: string,
    secondLocalKey: string
  ) {
    super(farClass, parent, firstKey, localKey);
    this.throughTable = throughClass.getTable();
    this.secondKey = secondKey;
    this.secondLocalKey = secondLocalKey;
    this._applyThrough();
  }

  private _applyThrough(): void {
    const farTable = this.modelClass.getTable();
    this._qb.join(
      this.throughTable,
      `${this.throughTable}.${this.secondLocalKey}`,
      '=',
      `${farTable}.${this.secondKey}`
    );
  }

  // ── Lazy load ─────────────────────────────────────────────────────────────

  async getResults(): Promise<Collection<TFar>> {
    this._checkLazyLoading();
    this._qb.where(`${this.throughTable}.${this.foreignKey}`, this.getParentKey());
    return this.get();
  }

  // ── Eager load hooks ──────────────────────────────────────────────────────

  addEagerConstraints(parents: Model[]): void {
    const farTable = this.modelClass.getTable();
    this._qb.selectRaw(`"${farTable}".*`);
    this._qb.selectRaw(`"${this.throughTable}"."${this.foreignKey}" AS "_through_fk"`);
    const keys = this.collectKeys(parents, this.localKey);
    this._qb.whereIn(`${this.throughTable}.${this.foreignKey}`, keys);
  }

  initRelation(parents: Model[], relation: string): Model[] {
    for (const parent of parents) {
      (parent as any)._relations[relation] = new ModelCollection([], this.modelClass as any);
    }
    return parents;
  }

  match(parents: Model[], results: Collection<TFar>, relation: string): Model[] {
    // Group related models by their surrogate through-FK
    const dict = new Map<unknown, TFar[]>();
    for (const related of results) {
      const key = (related as any)._attributes['_through_fk'];
      delete (related as any)._attributes['_through_fk'];
      if (!dict.has(key)) dict.set(key, []);
      dict.get(key)!.push(related);
    }

    for (const parent of parents) {
      const key = (parent as any)._attributes[this.localKey];
      (parent as any)._relations[relation] = new ModelCollection(
        dict.get(key) ?? [],
        this.modelClass as any
      );
    }

    return parents;
  }

  // ── Exists / Count SQL ────────────────────────────────────────────────────

  getExistsQuery(parentTable: string): string {
    const farTable = this.modelClass.getTable();
    return (
      `SELECT 1 FROM "${farTable}" ` +
      `INNER JOIN "${this.throughTable}" ON "${this.throughTable}"."${this.secondLocalKey}" = "${farTable}"."${this.secondKey}" ` +
      `WHERE "${this.throughTable}"."${this.foreignKey}" = "${parentTable}"."${this.localKey}"`
    );
  }

  getCountQuery(parentTable: string): string {
    const farTable = this.modelClass.getTable();
    return (
      `SELECT COUNT(*) FROM "${farTable}" ` +
      `INNER JOIN "${this.throughTable}" ON "${this.throughTable}"."${this.secondLocalKey}" = "${farTable}"."${this.secondKey}" ` +
      `WHERE "${this.throughTable}"."${this.foreignKey}" = "${parentTable}"."${this.localKey}"`
    );
  }
}
