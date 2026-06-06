import type { Model } from './Model';
import { ModelBuilder } from './ModelBuilder';
import { Relation } from './relations/Relation';

/** Constraint function that can be passed to `with()` to narrow an eager load. */
export type EagerConstraint = (query: ModelBuilder<any>) => void;

/** Map of relation name → optional constraint. */
export type EagerLoadMap = Map<string, EagerConstraint | null>;

/**
 * Resolves and executes eager loads for a set of already-hydrated parent models.
 *
 * The strategy mirrors Laravel's: run a **single additional query per relation**
 * using a `WHERE fk IN (parentIds)` clause, then distribute results back to
 * each parent in memory — eliminating N+1 queries.
 *
 * Dot-notation nesting (`'posts.comments'`) is handled recursively: after loading
 * `posts`, the loader runs `comments` on the resulting post models.
 */
export class EagerLoader {
  /**
   * Execute all eager loads defined in `eagerLoads` for the given `models`.
   *
   * @param models     - Already-hydrated parent model instances.
   * @param eagerLoads - Map of relation name → optional constraint callback.
   * @param modelClass - The parent model's constructor (for reflective access).
   */
  static async load(
    models: Model[],
    eagerLoads: EagerLoadMap,
    _modelClass: unknown
  ): Promise<void> {
    if (models.length === 0) return;

    // Parse nested relations: 'posts.comments' → { posts: ['comments'] }
    const topLevel = new Map<string, string[]>();
    const constraints = new Map<string, EagerConstraint | null>();

    for (const [key, constraint] of eagerLoads) {
      const dotIndex = key.indexOf('.');

      if (dotIndex === -1) {
        // Simple relation
        if (!topLevel.has(key)) topLevel.set(key, []);
        constraints.set(key, constraint);
      } else {
        // Nested: 'posts.comments.likes' → top = 'posts', rest = 'comments.likes'
        const top = key.slice(0, dotIndex);
        const rest = key.slice(dotIndex + 1);
        if (!topLevel.has(top)) topLevel.set(top, []);
        topLevel.get(top)!.push(rest);
        if (!constraints.has(top)) constraints.set(top, null);
      }
    }

    for (const [relation, nestedRelations] of topLevel) {
      await this._loadRelation(
        models,
        relation,
        constraints.get(relation) ?? null,
        nestedRelations
      );
    }
  }

  private static async _loadRelation(
    models: Model[],
    relationName: string,
    constraint: EagerConstraint | null,
    nestedRelations: string[]
  ): Promise<void> {
    // Get the Relation instance from a representative parent
    const rel = this._getRelation(models[0], relationName);
    if (!rel) {
      throw new Error(
        `[orion] Eager load: relation "${relationName}" not found on model ` +
          `"${models[0].constructor.name}". Make sure the method exists and returns a Relation.`
      );
    }

    // Set default empty values on all parents before we load
    rel.initRelation(models, relationName);

    // Constrain the query to only related records for these parents
    rel.addEagerConstraints(models);

    // Apply any user-supplied constraints (e.g. ordering, extra WHERE)
    if (constraint) constraint(rel);

    // Execute the query
    const results = await rel.get();

    // Distribute results back to each parent
    rel.match(models, results, relationName);

    // Recurse into nested relations if any
    if (nestedRelations.length > 0) {
      const nestedMap: EagerLoadMap = new Map(nestedRelations.map((r) => [r, null]));

      // Collect all related models that were just loaded
      const related: Model[] = [];
      for (const parent of models) {
        const loaded = (parent as any)._relations[relationName];
        if (!loaded) continue;
        if (loaded && typeof loaded[Symbol.iterator] === 'function') {
          related.push(...(loaded as Iterable<Model>));
        } else if (loaded) {
          related.push(loaded as Model);
        }
      }

      if (related.length > 0) {
        await this.load(related, nestedMap, related[0].constructor);
      }
    }
  }

  private static _getRelation(model: Model, name: string): Relation<any> | null {
    const method = (model as any)[name];
    if (typeof method !== 'function') return null;
    try {
      const result = method.call(model);
      return result instanceof Relation ? result : null;
    } catch {
      return null;
    }
  }
}
