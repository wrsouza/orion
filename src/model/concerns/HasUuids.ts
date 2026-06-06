import { ModelMetadata } from '../ModelMetadata';

type Constructor<T = {}> = new (...args: any[]) => T;

/**
 * Mixin that auto-generates a UUID v4 as the primary key (and any extra
 * columns listed in `uniqueIds()`) before every INSERT.
 *
 * Uses the built-in `crypto.randomUUID()` available in Node 14.17+.
 * Override `newUniqueId()` to supply a different generator (e.g. UUID v7).
 *
 * ### Usage
 * ```ts
 * import { Model, HasUuids } from 'orion';
 *
 * \@table('posts')
 * class Post extends HasUuids(Model) {
 *   declare id: string;
 * }
 *
 * const post = await Post.create({ title: 'Hello' });
 * // post.id → 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
 * ```
 */
export function HasUuids<TBase extends Constructor>(Base: TBase) {
  return class HasUuidsModel extends Base {
    /**
     * Generate a new unique ID. Override to use a custom generator such as
     * UUID v7, CUID, or nanoid.
     */
    newUniqueId(): string {
      return require('crypto').randomUUID() as string;
    }

    /**
     * Return the list of attribute names that should receive a generated UUID
     * before insert. Defaults to the model's primary key column.
     * Override to include additional columns.
     *
     * @example
     * ```ts
     * uniqueIds(): string[] {
     *   return ['id', 'public_token'];
     * }
     * ```
     */
    uniqueIds(): string[] {
      const cfg = ModelMetadata.resolve(this as any);
      return [cfg.primaryKey];
    }

    /**
     * @internal Called by `save()` before INSERT to populate UUID columns.
     * Overrides the `_beforeInsert` hook used by the Model base class.
     */
    _applyUniqueIds(): void {
      for (const col of (this as any).uniqueIds()) {
        if (!(this as any)._attributes[col]) {
          (this as any)._attributes[col] = (this as any).newUniqueId();
        }
      }
    }
  };
}
