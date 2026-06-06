import { ModelMetadata } from '../ModelMetadata';
import { SoftDeleteScope } from '../scopes/SoftDeleteScope';
import { withoutEvents } from '../events/EventDispatcher';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Constructor<T = {}> = new (...args: any[]) => T;

/**
 * A TypeScript mixin that adds soft delete behaviour to any `Model` subclass.
 *
 * When applied, the model's `delete()` method sets `deleted_at` to the current
 * timestamp instead of removing the row. A `SoftDeleteScope` global scope is
 * registered on the class so all queries automatically exclude soft-deleted rows.
 *
 * ### Usage
 * ```ts
 * import { Model, SoftDeletes } from 'orion';
 *
 * \@table('posts')
 * \@fillable(['title', 'body'])
 * class Post extends SoftDeletes(Model) {
 *   declare deleted_at: Date | null;
 * }
 * ```
 *
 * ### Instance API
 * ```ts
 * await post.delete();          // sets deleted_at, row stays in DB
 * await post.forceDelete();     // permanently removes the row
 * await post.restore();         // clears deleted_at
 * post.trashed();               // true if deleted_at is set
 * ```
 *
 * ### Query API
 * ```ts
 * await Post.withTrashed().get();       // all rows including soft-deleted
 * await Post.onlyTrashed().get();       // only soft-deleted rows
 * await Post.withTrashed().restore();   // restore all soft-deleted posts
 * await Post.withTrashed()
 *   .where('user_id', 1)
 *   .restore();                         // restore specific soft-deleted posts
 * ```
 */
export function SoftDeletes<TBase extends Constructor>(Base: TBase) {
  class SoftDeletable extends Base {
    /**
     * Boot the mixin: register `SoftDeleteScope` as a global scope on this class.
     * Called once when `Model.query()` is first invoked for the subclass.
     */
    static {
      const config = ModelMetadata.get(SoftDeletable);
      config.globalScopes.set('SoftDeleteScope', { scope: new SoftDeleteScope() });
    }

    /**
     * Soft-delete this model instance by setting `deleted_at` to now.
     * The row is NOT removed from the database.
     * Fires `deleting` → DB → `deleted`.
     */
    async delete(): Promise<boolean> {
      const self = this as any;
      if (!self.exists) return false;

      const dispatcher = ModelMetadata.get(self.constructor).dispatcher;
      if (!(await dispatcher.fire('deleting', self))) return false;

      const cfg = ModelMetadata.resolve(self);
      const now = new Date();

      self._attributes['deleted_at'] = now;
      await self
        ._newQueryBuilder()
        .withTrashed()
        .where(cfg.primaryKey, self._attributes[cfg.primaryKey])
        .update({ deleted_at: now });

      await dispatcher.fire('deleted', self);
      return true;
    }

    /**
     * Soft-delete without firing any events.
     */
    async deleteQuietly(): Promise<boolean> {
      return withoutEvents(() => (this as any).delete());
    }

    /**
     * Permanently delete this model from the database, bypassing soft deletes.
     * Fires `forceDeleting` → DB → `forceDeleted`.
     */
    async forceDelete(): Promise<boolean> {
      const self = this as any;
      if (!self.exists) return false;

      const dispatcher = ModelMetadata.get(self.constructor).dispatcher;
      if (!(await dispatcher.fire('forceDeleting', self))) return false;

      const cfg = ModelMetadata.resolve(self);
      await self
        ._newQueryBuilder()
        .withTrashed()
        .where(cfg.primaryKey, self._attributes[cfg.primaryKey])
        .delete();

      self.exists = false;
      await dispatcher.fire('forceDeleted', self);
      return true;
    }

    /**
     * Restore a soft-deleted model by clearing `deleted_at`.
     * Fires `restoring` → DB → `restored`.
     */
    async restore(): Promise<boolean> {
      const self = this as any;

      const dispatcher = ModelMetadata.get(self.constructor).dispatcher;
      if (!(await dispatcher.fire('restoring', self))) return false;

      const cfg = ModelMetadata.resolve(self);

      self._attributes['deleted_at'] = null;
      await self
        ._newQueryBuilder()
        .withTrashed()
        .where(cfg.primaryKey, self._attributes[cfg.primaryKey])
        .update({ deleted_at: null });

      self.exists = true;
      await dispatcher.fire('restored', self);
      return true;
    }

    /**
     * Restore without firing any events.
     */
    async restoreQuietly(): Promise<boolean> {
      return withoutEvents(() => (this as any).restore());
    }

    /**
     * Return `true` if this model has been soft-deleted (`deleted_at` is set).
     */
    trashed(): boolean {
      return (this as any)._attributes['deleted_at'] != null;
    }
  }

  return SoftDeletable;
}
