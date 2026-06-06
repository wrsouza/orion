import type { ModelBuilder } from '../ModelBuilder';

type Constructor<T = {}> = new (...args: any[]) => T;

/**
 * Like `Prunable`, but deletes matching records with a single bulk DELETE
 * statement instead of loading and deleting each row individually.
 *
 * Because no model instances are loaded, model events do **not** fire and
 * the `pruning()` hook is not called per-row. Use `Prunable` when you need
 * per-row hooks or events.
 *
 * ### Usage
 * ```ts
 * import { Model, MassPrunable } from 'orion';
 *
 * \@table('telemetry')
 * class Telemetry extends MassPrunable(Model) {
 *   prunable(): ModelBuilder<Telemetry> {
 *     return Telemetry.where('created_at', '<', subDays(new Date(), 30));
 *   }
 * }
 * ```
 */
export function MassPrunable<TBase extends Constructor>(Base: TBase) {
  return class MassPrunableModel extends Base {
    /**
     * Return a `ModelBuilder` scoped to the records that should be deleted.
     * Must be implemented in the subclass.
     */
    prunable(): ModelBuilder<any> {
      throw new Error(`[orion] ${(this as any).constructor.name} must implement prunable().`);
    }

    /**
     * Execute a single bulk DELETE for all records matching `prunable()`.
     *
     * @returns Number of records deleted.
     */
    static async pruneAll(): Promise<number> {
      const instance = new (this as any)() as any;
      const builder: ModelBuilder<any> = instance.prunable();
      return builder.delete();
    }
  };
}
