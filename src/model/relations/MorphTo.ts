import type { Model } from '../Model';
import { Collection } from '../Collection';
import { ModelCollection } from '../ModelCollection';
import { Relation, ModelConstructor } from './Relation';
import { MorphMap } from '../MorphMap';
import { ModelMetadata } from '../ModelMetadata';

/**
 * Represents the inverse of a polymorphic relationship.
 *
 * The current model has two columns:
 *   `{morphName}_type` — the class alias of the owning model (e.g. `'Post'`)
 *   `{morphName}_id`   — the primary key of the owning model
 *
 * @example
 * ```ts
 * class Image extends Model {
 *   imageable(): MorphTo {
 *     return this.morphTo('imageable');
 *     // Reads this.imageable_type + this.imageable_id to find the owner
 *   }
 * }
 *
 * const owner = await image.imageable().getResults(); // User | Post | null
 * ```
 */
export class MorphTo extends Relation<any> {
  private readonly morphTypeName: string;
  private readonly morphIdName: string;
  /** Parents stored during eager loading (set by addEagerConstraints). */
  private _eagerParents: Model[] = [];

  constructor(parent: Model, morphName: string, localKey: string) {
    // Use the parent's own constructor as a dummy — MorphTo overrides all
    // query execution methods and never uses the inherited _qb directly.
    const ctor = parent.constructor as ModelConstructor<any>;
    super(ctor, parent, `${morphName}_id`, localKey);
    this.morphTypeName = `${morphName}_type`;
    this.morphIdName = `${morphName}_id`;
  }

  // ── Lazy load ─────────────────────────────────────────────────────────────

  async getResults(): Promise<any> {
    this._checkLazyLoading();
    const type = (this.parent as any)._attributes[this.morphTypeName];
    const id = (this.parent as any)._attributes[this.morphIdName];
    if (!type || id === null || id === undefined) return null;

    const ModelClass = this._resolveClass(type);
    if (!ModelClass) return null;

    return (ModelClass as any).find(id);
  }

  // ── Eager load hooks ──────────────────────────────────────────────────────

  addEagerConstraints(parents: Model[]): void {
    // Store all parents so get() can do grouped queries
    this._eagerParents = parents;
  }

  initRelation(parents: Model[], relation: string): Model[] {
    for (const parent of parents) {
      (parent as any)._relations[relation] = null;
    }
    return parents;
  }

  /**
   * Execute grouped queries: one per distinct morph type found in the parents.
   * Results are tagged with `_morphKey = '{type}::{id}'` for matching.
   */
  async get(): Promise<ModelCollection<any>> {
    const byType = new Map<string, unknown[]>();

    for (const parent of this._eagerParents) {
      const type = (parent as any)._attributes[this.morphTypeName];
      const id = (parent as any)._attributes[this.morphIdName];
      if (!type || id === null || id === undefined) continue;
      if (!byType.has(type)) byType.set(type, []);
      byType.get(type)!.push(id);
    }

    const allResults: any[] = [];

    for (const [type, ids] of byType) {
      const ModelClass = this._resolveClass(type);
      if (!ModelClass) continue;

      const cfg = ModelMetadata.get(ModelClass);
      const rows = await (ModelClass as any).whereIn(cfg.primaryKey, ids).get();

      for (const m of rows) {
        (m as any)._morphKey = `${type}::${(m as any)._attributes[cfg.primaryKey]}`;
        allResults.push(m);
      }
    }

    // Use the parent's own constructor as a placeholder modelClass.
    // MorphTo results are heterogeneous (mixed types), so the modelClass here
    // is only used for ModelCollection's PK resolution, which is not meaningful
    // for polymorphic inverse results. Callers should handle this via getRelation().
    return new ModelCollection(allResults, this.modelClass as any);
  }

  match(parents: Model[], results: Collection<any>, relation: string): Model[] {
    // Index by composite type::id key
    const dict = new Map<string, any>();
    for (const related of results) {
      const key = (related as any)._morphKey;
      if (key) {
        delete (related as any)._morphKey;
        dict.set(key, related);
      }
    }

    for (const parent of parents) {
      const type = (parent as any)._attributes[this.morphTypeName];
      const id = (parent as any)._attributes[this.morphIdName];
      const lookupKey = `${type}::${id}`;
      (parent as any)._relations[relation] = dict.get(lookupKey) ?? null;
    }

    return parents;
  }

  // ── Exists / Count SQL ────────────────────────────────────────────────────
  // MorphTo is an inverse relation — has/whereHas is not supported on it.

  getExistsQuery(_parentTable: string): string {
    throw new Error('[orion] has() / whereHas() is not supported on morphTo relations.');
  }

  getCountQuery(_parentTable: string): string {
    throw new Error('[orion] withCount() is not supported on morphTo relations.');
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private _resolveClass(type: string): Function | null {
    return MorphMap.resolve(type) ?? null;
  }
}
