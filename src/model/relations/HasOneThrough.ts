import type { Model } from '../Model';
import { Collection } from '../Collection';
import { Relation, ModelConstructor } from './Relation';

/**
 * Represents a one-to-one relationship through an intermediate ("through") model.
 *
 * ```
 * countries ──< suppliers ──< users
 * Country hasOneThrough User through Supplier
 *   firstKey  = suppliers.country_id   (FK on through → parent)
 *   secondKey = users.supplier_id      (FK on far    → through)
 * ```
 *
 * @example
 * ```ts
 * class Country extends Model {
 *   latestUser(): HasOneThrough<User> {
 *     return this.hasOneThrough(User, Supplier);
 *     // firstKey  = 'country_id'  (on suppliers)
 *     // secondKey = 'supplier_id' (on users)
 *   }
 * }
 * ```
 */
export class HasOneThrough<TFar extends object> extends Relation<TFar> {
  private readonly throughTable: string;
  /** FK on the far model pointing to the through model (e.g. `supplier_id` on users). */
  private readonly secondKey: string;
  /** PK of the through model (e.g. `id` on suppliers). */
  private readonly secondLocalKey: string;

  constructor(
    farClass: ModelConstructor<TFar>,
    throughClass: ModelConstructor<any>,
    parent: Model,
    /** FK on through model → parent (e.g. `country_id` on suppliers). */
    firstKey: string,
    secondKey: string,
    localKey: string,
    secondLocalKey: string
  ) {
    super(farClass, parent, firstKey, localKey);
    this.throughTable = throughClass.getTable();
    this.secondKey = secondKey;
    this.secondLocalKey = secondLocalKey;
    // Apply the JOIN once — used for both lazy and eager loading
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

  async getResults(): Promise<TFar | null> {
    this._checkLazyLoading();
    this._qb.where(`${this.throughTable}.${this.foreignKey}`, this.getParentKey());
    this._qb.limit(1);
    const rows = await this._qb.get();
    return rows[0] ? (this.modelClass as any).hydrate(rows[0]) : null;
  }

  // ── Eager load hooks ──────────────────────────────────────────────────────

  addEagerConstraints(parents: Model[]): void {
    const farTable = this.modelClass.getTable();
    // Add the through FK as a surrogate so we can match results back to parents
    this._qb.selectRaw(`"${farTable}".*`);
    this._qb.selectRaw(`"${this.throughTable}"."${this.foreignKey}" AS "_through_fk"`);
    const keys = this.collectKeys(parents, this.localKey);
    this._qb.whereIn(`${this.throughTable}.${this.foreignKey}`, keys);
  }

  initRelation(parents: Model[], relation: string): Model[] {
    for (const parent of parents) {
      (parent as any)._relations[relation] = null;
    }
    return parents;
  }

  match(parents: Model[], results: Collection<TFar>, relation: string): Model[] {
    // Index by the surrogate through-FK, taking the first per group
    const dict = new Map<unknown, TFar>();
    for (const related of results) {
      const key = (related as any)._attributes['_through_fk'];
      delete (related as any)._attributes['_through_fk'];
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
