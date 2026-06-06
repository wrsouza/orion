import { ModelBuilder } from '../ModelBuilder';
import { Scope } from './Scope';

/**
 * Global scope automatically applied to models using the `SoftDeletes` mixin.
 *
 * Adds `WHERE "deleted_at" IS NULL` to every query so soft-deleted rows are
 * invisible by default. Bypass it for a specific query with:
 *
 * ```ts
 * Post.withTrashed().get()     // include all rows
 * Post.onlyTrashed().get()     // only deleted rows
 * Post.withoutGlobalScope('SoftDeleteScope').get()
 * ```
 */
export class SoftDeleteScope implements Scope {
  apply(builder: ModelBuilder<any>): void {
    builder.whereNull('deleted_at');
  }
}
