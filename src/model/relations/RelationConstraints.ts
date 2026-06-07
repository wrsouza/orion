/**
 * Shared flag used to disable base query constraints on Relation constructors
 * during eager loading. EagerLoader sets this via noConstraints() so that
 * addEagerConstraints() can replace the single WHERE with a whereIn.
 */
export let _skipRelationConstraints = false;

export function noConstraints<T>(fn: () => T): T {
  _skipRelationConstraints = true;
  try {
    return fn();
  } finally {
    _skipRelationConstraints = false;
  }
}
