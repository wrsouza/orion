import type { ModelBuilder } from '../ModelBuilder';

type Constructor<T = {}> = new (...args: any[]) => T;

/**
 * Mixin that enables record pruning via `orion model:prune`.
 *
 * Override `prunable()` to return a query builder scoped to the records that
 * should be deleted. The `pruning()` hook fires before each deletion so you
 * can perform cleanup (e.g. delete related files).
 *
 * Records are deleted one by one so that model events fire for each row.
 * Use `MassPrunable` if you want a single bulk DELETE instead.
 *
 * ### Usage
 * ```ts
 * import { Model, Prunable } from 'orion';
 *
 * \@table('activity_logs')
 * class ActivityLog extends Prunable(Model) {
 *   prunable(): ModelBuilder<ActivityLog> {
 *     return ActivityLog.where('created_at', '<', subDays(new Date(), 90));
 *   }
 * }
 * ```
 */
export function Prunable<TBase extends Constructor>(Base: TBase) {
  return class PrunableModel extends Base {
    /**
     * Return a `ModelBuilder` scoped to the records that should be pruned.
     * Must be implemented in the subclass.
     */
    prunable(): ModelBuilder<any> {
      throw new Error(`[orion] ${(this as any).constructor.name} must implement prunable().`);
    }

    /**
     * Hook called before each record is deleted during pruning.
     * Override to perform cleanup (e.g. delete S3 files).
     */
    pruning(): void | Promise<void> {}

    /**
     * Execute the prune operation: fetch matching records, call `pruning()`
     * on each, then delete them one by one (so model events fire).
     *
     * @returns Number of records pruned.
     */
    static async pruneAll(chunkSize = 1000): Promise<number> {
      const instance = new (this as any)() as any;
      const builder: ModelBuilder<any> = instance.prunable();
      let pruned = 0;

      await builder.chunk(chunkSize, async (models) => {
        for (const model of models) {
          await (model as any).pruning();
          await (model as any).delete();
          pruned++;
        }
      });

      return pruned;
    }
  };
}
