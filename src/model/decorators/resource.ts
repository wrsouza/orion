import { ModelMetadata } from '../ModelMetadata';

/**
 * Bind a `Resource` class to a model.
 * Enables `model.toResource()` to auto-discover the correct resource class.
 *
 * @example
 * ```ts
 * \@UseResource(UserResource)
 * \@table('users')
 * class User extends Model { ... }
 *
 * const resource = user.toResource();   // UserResource instance
 * ```
 */
export function UseResource(resourceClass: new (resource: any) => any): ClassDecorator {
  return (target) => {
    ModelMetadata.get(target).resourceClass = resourceClass;
  };
}

/**
 * Bind a `ResourceCollection` class to a model.
 * Enables `users.toResourceCollection()` to use a custom collection class.
 *
 * @example
 * ```ts
 * \@UseResourceCollection(UserResourceCollection)
 * \@table('users')
 * class User extends Model { ... }
 * ```
 */
export function UseResourceCollection(
  collectionClass: new (items: any[], resourceClass?: any) => any
): ClassDecorator {
  return (target) => {
    ModelMetadata.get(target).resourceCollectionClass = collectionClass;
  };
}
