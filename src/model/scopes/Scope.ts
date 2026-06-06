import { ModelBuilder } from '../ModelBuilder';

/**
 * Contract for a global query scope.
 *
 * Implement this interface and register the scope on a model with `@scopedBy`
 * (or `ModelMetadata.get(MyModel).globalScopes.set(name, { scope })` programmatically).
 * The `apply` method is invoked once before every query executed by `ModelBuilder`.
 *
 * @example
 * ```ts
 * export class ActiveScope implements Scope {
 *   apply(builder: ModelBuilder<any>): void {
 *     builder.where('is_active', true);
 *   }
 * }
 *
 * \@scopedBy([ActiveScope])
 * \@table('users')
 * class User extends Model { ... }
 *
 * // Every query now includes WHERE is_active = true
 * await User.all();
 * await User.where('name', 'Alice').get();
 *
 * // Opt out for a specific query
 * await User.withoutGlobalScope('ActiveScope').get();
 * ```
 */
export interface Scope {
  /**
   * Constrain the given query builder.
   * @param builder - The `ModelBuilder` for the model being queried.
   * @param model   - The model constructor the scope is attached to.
   */
  apply(builder: ModelBuilder<any>, model: Function): void;
}
