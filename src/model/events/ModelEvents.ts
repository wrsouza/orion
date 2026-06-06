export type ModelEvent =
  | 'retrieved'
  | 'creating'
  | 'created'
  | 'updating'
  | 'updated'
  | 'saving'
  | 'saved'
  | 'deleting'
  | 'deleted'
  | 'restoring'
  | 'restored'
  | 'forceDeleting'
  | 'forceDeleted'
  | 'replicating';

/** Return `false` from a `-ing` listener to cancel the operation. */
export type ModelListener<T = any> = (model: T) => boolean | void | Promise<boolean | void>;
