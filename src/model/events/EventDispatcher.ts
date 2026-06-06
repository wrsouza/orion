import { ModelEvent, ModelListener } from './ModelEvents';

/** Module-level flag; nested calls restore the previous state. */
let _eventsDisabled = false;

/**
 * Run `callback` with all event dispatch suppressed.
 * Nesting is supported: the outer flag is restored on exit.
 */
export async function withoutEvents<T>(callback: () => T | Promise<T>): Promise<T> {
  const prev = _eventsDisabled;
  _eventsDisabled = true;
  try {
    return await callback();
  } finally {
    _eventsDisabled = prev;
  }
}

/**
 * Per-class event listener registry.
 * One `EventDispatcher` is stored in each class's `ModelConfig`.
 */
export class EventDispatcher {
  private readonly listeners = new Map<ModelEvent, ModelListener[]>();

  /** Register a listener for `event`. */
  on(event: ModelEvent, listener: ModelListener): void {
    let bucket = this.listeners.get(event);
    if (!bucket) {
      bucket = [];
      this.listeners.set(event, bucket);
    }
    bucket.push(listener);
  }

  /**
   * Fire an async (potentially cancellable) event.
   * Returns `false` if any listener returns `false`; `true` otherwise.
   * Skips all listeners when events are globally disabled.
   */
  async fire(event: ModelEvent, model: unknown): Promise<boolean> {
    if (_eventsDisabled) return true;
    const bucket = this.listeners.get(event);
    if (!bucket) return true;
    for (const listener of bucket) {
      const result = await listener(model);
      if (result === false) return false;
    }
    return true;
  }

  /**
   * Fire a notification-only event without awaiting.
   * Used for `retrieved` and `replicating` which cannot cancel operations.
   * Listener return values and promises are ignored.
   */
  fireSync(event: ModelEvent, model: unknown): void {
    if (_eventsDisabled) return;
    const bucket = this.listeners.get(event);
    if (!bucket) return;
    for (const listener of bucket) {
      void listener(model); // fireSync intentionally ignores listener return values and promises
    }
  }
}
