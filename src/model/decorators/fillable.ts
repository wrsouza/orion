import { ModelMetadata } from '../ModelMetadata';

/**
 * Declare which columns are mass-assignable via `create()`, `fill()`, or `update()`.
 * Any column not listed here (or not covered by `\@guarded`) is silently discarded
 * during mass assignment.
 *
 * @example
 * ```ts
 * \@fillable(['name', 'email', 'password'])
 * class User extends Model { ... }
 * ```
 */
export function fillable(columns: string[]): ClassDecorator {
  return (target) => {
    const config = ModelMetadata.get(target);
    config.fillable = columns;
    // Setting fillable implicitly removes the catch-all guard
    if (config.guarded.includes('*')) config.guarded = [];
  };
}

/**
 * Declare which columns are blocked from mass assignment.
 * Use `\@guarded([])` to allow all columns (equivalent to Eloquent's `$guarded = []`).
 *
 * @example
 * ```ts
 * \@guarded(['is_admin', 'role'])
 * class User extends Model { ... }
 * ```
 */
export function guarded(columns: string[]): ClassDecorator {
  return (target) => {
    ModelMetadata.get(target).guarded = columns;
  };
}
