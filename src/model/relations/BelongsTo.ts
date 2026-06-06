import type { Model } from '../Model';
import { Collection } from '../Collection';
import { Relation } from './Relation';

/**
 * Represents the inverse side of a `hasOne` or `hasMany` relationship.
 * The **foreign key lives on this model's table**, pointing to the related model.
 *
 * ```
 * users >── comments
 * comments.user_id  ← foreignKey (on this model)
 * users.id          ← ownerKey (on related)
 * ```
 *
 * @example
 * ```ts
 * class Comment extends Model {
 *   author(): BelongsTo<User> {
 *     return this.belongsTo(User);
 *     // Infers foreignKey = 'user_id', ownerKey = 'id'
 *   }
 * }
 *
 * const author = await comment.author().first();
 * await comment.author().associate(user).save();
 * await comment.author().dissociate().save();
 * ```
 */
export class BelongsTo<TRelated extends object> extends Relation<TRelated> {
  /**
   * The key on the **related** model that the FK points to (usually the PK).
   * Named `ownerKey` to avoid confusion with the parent's `localKey`.
   */
  readonly ownerKey: string;

  private _defaultAttributes: Record<string, unknown> | (() => TRelated) | null = null;

  constructor(
    relatedClass: import('./Relation').ModelConstructor<TRelated>,
    parent: Model,
    foreignKey: string,
    ownerKey: string
  ) {
    // For BelongsTo: localKey is actually the foreignKey on `this` model,
    // and the "local" side of the join is the ownerKey on the related model.
    super(relatedClass, parent, foreignKey, ownerKey);
    this.ownerKey = ownerKey;
  }

  // ── Default model ─────────────────────────────────────────────────────────

  /**
   * Return a default (empty) model when the relation returns `null`.
   *
   * @example
   * ```ts
   * author(): BelongsTo<User> {
   *   return this.belongsTo(User).withDefault({ name: 'Guest' });
   * }
   * ```
   */
  withDefault(attributes: Record<string, unknown> | (() => TRelated) = {}): this {
    this._defaultAttributes = attributes as Record<string, unknown>;
    return this;
  }

  private _resolveDefault(): TRelated | null {
    if (this._defaultAttributes === null) return null;
    if (typeof this._defaultAttributes === 'function') return this._defaultAttributes();
    return (this.modelClass as any).newInstance(this._defaultAttributes);
  }

  // ── Lazy load ─────────────────────────────────────────────────────────────

  async getResults(): Promise<TRelated | null> {
    this._checkLazyLoading();
    const fkValue = (this.parent as any)._attributes[this.foreignKey];
    if (fkValue === null || fkValue === undefined) return this._resolveDefault();
    this.where(this.ownerKey, fkValue);
    const result = await this.first();
    return result ?? this._resolveDefault();
  }

  // ── Eager load hooks ──────────────────────────────────────────────────────

  addEagerConstraints(parents: Model[]): void {
    // Collect the FK values from this model (e.g. comment.user_id)
    const keys = this.collectKeys(parents, this.foreignKey);
    this.whereIn(this.ownerKey, keys);
  }

  initRelation(parents: Model[], relation: string): Model[] {
    for (const parent of parents) {
      (parent as any)._relations[relation] = null;
    }
    return parents;
  }

  match(parents: Model[], results: Collection<TRelated>, relation: string): Model[] {
    // Build a dictionary: ownerKey value → related model
    const dict = new Map<unknown, TRelated>();
    for (const related of results) {
      const key = (related as any)._attributes[this.ownerKey];
      dict.set(key, related);
    }

    for (const parent of parents) {
      const fk = (parent as any)._attributes[this.foreignKey];
      (parent as any)._relations[relation] = dict.get(fk) ?? null;
    }

    return parents;
  }

  // ── Exists / Count SQL ────────────────────────────────────────────────────

  getExistsQuery(parentTable: string): string {
    const rel = this.modelClass.getTable();
    return `SELECT 1 FROM "${rel}" WHERE "${rel}"."${this.ownerKey}" = "${parentTable}"."${this.foreignKey}"`;
  }

  getCountQuery(parentTable: string): string {
    const rel = this.modelClass.getTable();
    return `SELECT COUNT(*) FROM "${rel}" WHERE "${rel}"."${this.ownerKey}" = "${parentTable}"."${this.foreignKey}"`;
  }

  // ── Association helpers ───────────────────────────────────────────────────

  /**
   * Set this model's foreign key to the given related model's owner key.
   * Call `save()` on the parent afterwards to persist.
   *
   * @example
   * ```ts
   * await comment.author().associate(user).save();
   * // Equivalent to: comment.user_id = user.id; await comment.save();
   * ```
   */
  associate(model: TRelated): Model {
    (this.parent as any)._attributes[this.foreignKey] = (model as any)._attributes[this.ownerKey];
    return this.parent;
  }

  /**
   * Set this model's foreign key to `null`.
   * Call `save()` on the parent afterwards to persist.
   *
   * @example
   * ```ts
   * await comment.author().dissociate().save();
   * ```
   */
  dissociate(): Model {
    (this.parent as any)._attributes[this.foreignKey] = null;
    return this.parent;
  }
}
