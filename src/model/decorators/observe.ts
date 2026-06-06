import { ModelMetadata } from '../ModelMetadata';
import { ModelEvent } from '../events/ModelEvents';
import { Observer } from '../events/Observer';

const OBSERVER_EVENTS: ModelEvent[] = [
  'retrieved',
  'creating',
  'created',
  'updating',
  'updated',
  'saving',
  'saved',
  'deleting',
  'deleted',
  'restoring',
  'restored',
  'forceDeleting',
  'forceDeleted',
  'replicating',
];

/**
 * Class decorator that registers one or more observer classes on the model.
 *
 * @example
 * ```ts
 * \@observedBy([UserObserver, AuditObserver])
 * class User extends Model { }
 * ```
 */
export function observedBy(observers: (new () => Observer)[]): ClassDecorator {
  return (target) => {
    const cfg = ModelMetadata.get(target as unknown as Function);
    for (const ObserverClass of observers) {
      registerObserver(cfg.dispatcher, new ObserverClass());
    }
  };
}

/** @internal Shared logic used by both the decorator and `Model.observe()`. */
export function registerObserver(
  dispatcher: import('../events/EventDispatcher').EventDispatcher,
  instance: Observer
): void {
  for (const event of OBSERVER_EVENTS) {
    const method = (instance as any)[event];
    if (typeof method === 'function') {
      dispatcher.on(event, method.bind(instance));
    }
  }
}
