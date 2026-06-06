/**
 * Thrown when a relation is lazily loaded while `Model.preventLazyLoading()` is active.
 */
export class LazyLoadingViolationError extends Error {
  constructor(modelName: string, relatedName: string) {
    super(
      `[orion] Attempted to lazy load "${relatedName}" on model "${modelName}" without eager loading. ` +
        `Use Model.with('relation') or call Model.preventLazyLoading(false) to disable this check.`
    );
    this.name = 'LazyLoadingViolationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
