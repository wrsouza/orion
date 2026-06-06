import { ModelListener } from './ModelEvents';

/**
 * Interface for model observer classes.
 * Implement only the lifecycle hooks you need — all methods are optional.
 *
 * @example
 * ```ts
 * class UserObserver implements Observer<User> {
 *   created(user: User) {
 *     console.log('User created:', user.id);
 *   }
 *   deleting(user: User) {
 *     // return false to cancel
 *     if (user.is_admin) return false;
 *   }
 * }
 *
 * User.observe(new UserObserver());
 * ```
 */
export interface Observer<T = any> {
  retrieved?(model: T): ReturnType<ModelListener<T>>;
  creating?(model: T): ReturnType<ModelListener<T>>;
  created?(model: T): ReturnType<ModelListener<T>>;
  updating?(model: T): ReturnType<ModelListener<T>>;
  updated?(model: T): ReturnType<ModelListener<T>>;
  saving?(model: T): ReturnType<ModelListener<T>>;
  saved?(model: T): ReturnType<ModelListener<T>>;
  deleting?(model: T): ReturnType<ModelListener<T>>;
  deleted?(model: T): ReturnType<ModelListener<T>>;
  restoring?(model: T): ReturnType<ModelListener<T>>;
  restored?(model: T): ReturnType<ModelListener<T>>;
  forceDeleting?(model: T): ReturnType<ModelListener<T>>;
  forceDeleted?(model: T): ReturnType<ModelListener<T>>;
  replicating?(model: T): ReturnType<ModelListener<T>>;
}
