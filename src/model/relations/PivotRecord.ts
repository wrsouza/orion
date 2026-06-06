/**
 * Holds the extra columns read from a many-to-many pivot table.
 * Accessed via `model.pivot` on a related model loaded through `belongsToMany`.
 *
 * @example
 * ```ts
 * const roles = await user.roles().withPivot('approved', 'assigned_at').get();
 * for (const role of roles) {
 *   console.log(role.pivot.get('approved'));   // true / false
 *   console.log(role.pivot.get('assigned_at')); // Date string
 * }
 * ```
 */
export class PivotRecord {
  private readonly _data: Record<string, unknown>;

  constructor(data: Record<string, unknown>) {
    this._data = data;
  }

  /** Return the value of a pivot column. */
  get(column: string): unknown {
    return this._data[column];
  }

  /** Return all pivot columns as a plain object. */
  toObject(): Record<string, unknown> {
    return { ...this._data };
  }

  toJSON(): Record<string, unknown> {
    return this.toObject();
  }
}
