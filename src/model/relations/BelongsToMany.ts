import type { Model } from '../Model';
import { Collection } from '../Collection';
import { ModelCollection } from '../ModelCollection';
import { Relation, ModelConstructor } from './Relation';
import { PivotRecord } from './PivotRecord';

/**
 * Represents a many-to-many relationship via an intermediate pivot table.
 *
 * ```
 * users >──< roles
 *            role_user   ← pivot table
 *            user_id     ← foreignPivotKey
 *            role_id     ← relatedPivotKey
 * ```
 *
 * @example
 * ```ts
 * class User extends Model {
 *   roles(): BelongsToMany<Role> {
 *     return this.belongsToMany(Role);
 *     // Infers pivot = 'role_user', FK = 'user_id', relatedFK = 'role_id'
 *   }
 * }
 *
 * const roles = await user.roles().get();
 * await user.roles().attach(roleId);
 * await user.roles().sync([1, 2, 3]);
 * ```
 */
export class BelongsToMany<TRelated extends object> extends Relation<TRelated> {
  /** The pivot / intermediate table name. */
  readonly pivotTable: string;
  /** FK on the pivot table pointing to the **parent** model. */
  readonly foreignPivotKey: string;
  /** FK on the pivot table pointing to the **related** model. */
  readonly relatedPivotKey: string;
  /** The PK column name on the related model. */
  readonly relatedKey: string;

  /** Extra pivot columns to select when loading. */
  private _pivotColumns: string[] = [];
  /** Whether to select created_at/updated_at from the pivot table. */
  private _pivotTimestamps = false;
  /** Custom alias for the pivot relation (default: `'pivot'`). */
  private _pivotAlias = 'pivot';
  /** Fixed pivot column values automatically merged into every `attach()` call. */
  private _pivotValues: Record<string, unknown> = {};

  constructor(
    relatedClass: ModelConstructor<TRelated>,
    parent: Model,
    pivotTable: string,
    foreignPivotKey: string,
    relatedPivotKey: string,
    localKey: string,
    relatedKey: string
  ) {
    super(relatedClass, parent, foreignPivotKey, localKey);
    this.pivotTable = pivotTable;
    this.foreignPivotKey = foreignPivotKey;
    this.relatedPivotKey = relatedPivotKey;
    this.relatedKey = relatedKey;
  }

  // ── Configuration ─────────────────────────────────────────────────────────

  /**
   * Include additional pivot columns in the loaded related models.
   *
   * @example
   * ```ts
   * user.roles().withPivot('approved', 'expires_at').get()
   * ```
   */
  withPivot(...columns: string[]): this {
    this._pivotColumns.push(...columns);
    return this;
  }

  /**
   * Set a fixed value that is automatically merged into every `attach()` call.
   *
   * @example
   * ```ts
   * this.belongsToMany(Role).withPivot('approved').withPivotValue('approved', true)
   * // Every attach() will include { approved: true } unless overridden by the caller.
   * ```
   */
  withPivotValue(column: string, value: unknown): this {
    this._pivotValues[column] = value;
    return this;
  }

  /**
   * Include `created_at` and `updated_at` from the pivot table.
   */
  withTimestamps(): this {
    this._pivotTimestamps = true;
    return this;
  }

  /**
   * Rename the pivot accessor on loaded related models.
   *
   * @example
   * ```ts
   * user.roles().as('membership').get()
   * // role.getRelation<PivotRecord>('membership')
   * ```
   */
  as(alias: string): this {
    this._pivotAlias = alias;
    return this;
  }

  /**
   * Add a WHERE condition on a pivot column.
   *
   * @example
   * ```ts
   * user.roles().wherePivot('approved', true).get()
   * ```
   */
  wherePivot(column: string, operatorOrValue: unknown, value?: unknown): this {
    if (value !== undefined) {
      this.where(`${this.pivotTable}.${column}`, operatorOrValue, value);
    } else {
      this.where(`${this.pivotTable}.${column}`, operatorOrValue);
    }
    return this;
  }

  /**
   * Add a `WHERE IN` condition on a pivot column.
   */
  wherePivotIn(column: string, values: unknown[]): this {
    this.whereIn(`${this.pivotTable}.${column}`, values);
    return this;
  }

  /**
   * Add a `WHERE NOT IN` condition on a pivot column.
   */
  wherePivotNotIn(column: string, values: unknown[]): this {
    this.whereNotIn(`${this.pivotTable}.${column}`, values);
    return this;
  }

  /**
   * Add a `WHERE BETWEEN` condition on a pivot column.
   */
  wherePivotBetween(column: string, range: [unknown, unknown]): this {
    this.whereBetween(`${this.pivotTable}.${column}`, range);
    return this;
  }

  /**
   * Add a `WHERE NOT BETWEEN` condition on a pivot column.
   */
  wherePivotNotBetween(column: string, range: [unknown, unknown]): this {
    this.whereNotBetween(`${this.pivotTable}.${column}`, range);
    return this;
  }

  /**
   * Add a `WHERE IS NULL` condition on a pivot column.
   */
  wherePivotNull(column: string): this {
    this.whereNull(`${this.pivotTable}.${column}`);
    return this;
  }

  /**
   * Add a `WHERE IS NOT NULL` condition on a pivot column.
   */
  wherePivotNotNull(column: string): this {
    this.whereNotNull(`${this.pivotTable}.${column}`);
    return this;
  }

  /**
   * Order results by a pivot column ascending.
   */
  orderByPivot(column: string, direction: 'asc' | 'desc' = 'asc'): this {
    this.orderBy(`${this.pivotTable}.${column}`, direction);
    return this;
  }

  /**
   * Order results by a pivot column descending.
   */
  orderByPivotDesc(column: string): this {
    return this.orderByPivot(column, 'desc');
  }

  // ── Lazy load ─────────────────────────────────────────────────────────────

  async getResults(): Promise<Collection<TRelated>> {
    this._checkLazyLoading();
    this._applyJoin();
    this.where(`${this.pivotTable}.${this.foreignPivotKey}`, this.getParentKey());
    return this.get();
  }

  // ── Eager load hooks ──────────────────────────────────────────────────────

  addEagerConstraints(parents: Model[]): void {
    this._applyJoin();
    const keys = this.collectKeys(parents, this.localKey);
    this.whereIn(`${this.pivotTable}.${this.foreignPivotKey}`, keys);
  }

  initRelation(parents: Model[], relation: string): Model[] {
    for (const parent of parents) {
      (parent as any)._relations[relation] = new ModelCollection([], this.modelClass as any);
    }
    return parents;
  }

  match(parents: Model[], results: Collection<TRelated>, relation: string): Model[] {
    // Group by the pivot FK that points to the parent
    const dict = new Map<unknown, TRelated[]>();
    for (const related of results) {
      const fk = (related as any)._attributes[`pivot_${this.foreignPivotKey}`];
      if (!dict.has(fk)) dict.set(fk, []);
      dict.get(fk)!.push(related);
    }

    for (const parent of parents) {
      const key = (parent as any)._attributes[this.localKey];
      (parent as any)._relations[relation] = new ModelCollection(
        dict.get(key) ?? [],
        this.modelClass as any
      );
    }

    return parents;
  }

  // ── Exists / Count SQL ────────────────────────────────────────────────────

  getExistsQuery(parentTable: string): string {
    return (
      `SELECT 1 FROM "${this.pivotTable}" ` +
      `WHERE "${this.pivotTable}"."${this.foreignPivotKey}" = "${parentTable}"."${this.localKey}"`
    );
  }

  getCountQuery(parentTable: string): string {
    return (
      `SELECT COUNT(*) FROM "${this.pivotTable}" ` +
      `WHERE "${this.pivotTable}"."${this.foreignPivotKey}" = "${parentTable}"."${this.localKey}"`
    );
  }

  // ── Pivot operations ──────────────────────────────────────────────────────

  /**
   * Attach one or more related models to the parent via the pivot table.
   * Does NOT remove existing records.
   *
   * @param ids     - Single id, array of ids, or `{ id: pivotAttributes }` map.
   * @param attributes - Extra pivot column values applied to all attached rows.
   */
  async attach(
    ids: unknown | unknown[] | Record<string | number, Record<string, unknown>>,
    attributes: Record<string, unknown> = {}
  ): Promise<void> {
    const rows = this._buildPivotRows(ids, { ...this._pivotValues, ...attributes });
    if (rows.length === 0) return;
    await this._qb.from(this.pivotTable).insert(rows);
  }

  /**
   * Detach one or more related models. Pass no argument to detach all.
   */
  async detach(ids?: unknown | unknown[]): Promise<number> {
    const qb = this._qb
      .newQuery()
      .from(this.pivotTable)
      .where(this.foreignPivotKey, this.getParentKey());

    if (ids !== undefined) {
      const arr = Array.isArray(ids) ? ids : [ids];
      qb.whereIn(this.relatedPivotKey, arr);
    }

    return qb.delete();
  }

  /**
   * Sync the pivot table to exactly match `ids`.
   * Attaches new records, detaches removed ones.
   *
   * @param ids       - Ids to keep, optionally with pivot attributes.
   * @param detaching - Set to `false` to only attach new (never detach).
   */
  async sync(
    ids: unknown[] | Record<string | number, Record<string, unknown>>,
    detaching = true
  ): Promise<{ attached: unknown[]; detached: unknown[]; updated: unknown[] }> {
    const current = await this._currentIds();
    const desired = this._normaliseIds(ids);

    const desiredIds = desired.map((r) => r.id);
    const attached: unknown[] = [];
    const detached: unknown[] = [];
    const updated: unknown[] = [];

    // Attach new
    for (const row of desired) {
      if (!current.includes(row.id)) {
        await this.attach(row.id, row.attrs);
        attached.push(row.id);
      } else if (Object.keys(row.attrs).length > 0) {
        await this.updateExistingPivot(row.id, row.attrs);
        updated.push(row.id);
      }
    }

    // Detach removed
    if (detaching) {
      const toDetach = current.filter((id) => !desiredIds.includes(id));
      if (toDetach.length > 0) {
        await this.detach(toDetach);
        detached.push(...toDetach);
      }
    }

    return { attached, detached, updated };
  }

  /**
   * Toggle attachment: attach if not present, detach if present.
   */
  async toggle(ids: unknown | unknown[]): Promise<{ attached: unknown[]; detached: unknown[] }> {
    const current = await this._currentIds();
    const arr = Array.isArray(ids) ? ids : [ids];

    const toAttach = arr.filter((id) => !current.includes(id));
    const toDetach = arr.filter((id) => current.includes(id));

    if (toAttach.length) await this.attach(toAttach);
    if (toDetach.length) await this.detach(toDetach);

    return { attached: toAttach, detached: toDetach };
  }

  /**
   * Like `sync()`, but never detaches existing records.
   * Equivalent to `sync(ids, false)`.
   *
   * @example
   * ```ts
   * await user.roles().syncWithoutDetaching([1, 2]);
   * ```
   */
  async syncWithoutDetaching(
    ids: unknown[] | Record<string | number, Record<string, unknown>>
  ): Promise<{ attached: unknown[]; detached: unknown[]; updated: unknown[] }> {
    return this.sync(ids, false);
  }

  /**
   * Like `sync()`, but merges `pivotValues` into every attached row automatically.
   * Equivalent to calling `withPivotValue` for each key then syncing.
   *
   * @example
   * ```ts
   * await user.roles().syncWithPivotValues([1, 2], { approved: true });
   * ```
   */
  async syncWithPivotValues(
    ids: unknown[],
    pivotValues: Record<string, unknown>,
    detaching = true
  ): Promise<{ attached: unknown[]; detached: unknown[]; updated: unknown[] }> {
    const map: Record<string | number, Record<string, unknown>> = {};
    for (const id of ids) map[id as string | number] = { ...pivotValues };
    return this.sync(map, detaching);
  }

  /**
   * Update pivot columns for an existing record without re-attaching.
   */
  async updateExistingPivot(id: unknown, attributes: Record<string, unknown>): Promise<number> {
    return this._qb
      .newQuery()
      .from(this.pivotTable)
      .where(this.foreignPivotKey, this.getParentKey())
      .where(this.relatedPivotKey, id)
      .update(attributes);
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  /** Add the JOIN to the pivot table, then to the related table. */
  protected _applyJoin(): void {
    const relTable = this.modelClass.getTable();
    const pivotFk = `${this.pivotTable}.${this.relatedPivotKey}`;
    const relPk = `${relTable}.${this.relatedKey}`;

    // Select related columns + pivot FK (for matching)
    this.selectRaw(`"${relTable}".*`);
    this.selectRaw(
      `"${this.pivotTable}"."${this.foreignPivotKey}" AS "pivot_${this.foreignPivotKey}"`
    );

    for (const col of this._pivotColumns) {
      this.selectRaw(`"${this.pivotTable}"."${col}" AS "pivot_${col}"`);
    }

    if (this._pivotTimestamps) {
      this.selectRaw(`"${this.pivotTable}"."created_at" AS "pivot_created_at"`);
      this.selectRaw(`"${this.pivotTable}"."updated_at" AS "pivot_updated_at"`);
    }

    this._qb.join(this.pivotTable, pivotFk, '=', relPk);
  }

  /** Hydrate: after get(), attach a PivotRecord to each related model. */
  async get(): Promise<ModelCollection<TRelated>> {
    const results = await super.get();

    // Attach pivot data to each result
    for (const model of results) {
      const pivotData: Record<string, unknown> = {};

      for (const col of [this.foreignPivotKey, ...this._pivotColumns]) {
        const key = `pivot_${col}`;
        pivotData[col] = (model as any)._attributes[key];
        delete (model as any)._attributes[key];
      }

      if (this._pivotTimestamps) {
        for (const ts of ['created_at', 'updated_at']) {
          pivotData[ts] = (model as any)._attributes[`pivot_${ts}`];
          delete (model as any)._attributes[`pivot_${ts}`];
        }
      }

      (model as any)._relations[this._pivotAlias] = new PivotRecord(pivotData);
    }

    return results;
  }

  private async _currentIds(): Promise<unknown[]> {
    const rows = await this._qb
      .newQuery()
      .from(this.pivotTable)
      .where(this.foreignPivotKey, this.getParentKey())
      .pluck(this.relatedPivotKey);
    return rows;
  }

  private _normaliseIds(
    ids: unknown[] | Record<string | number, Record<string, unknown>>
  ): { id: unknown; attrs: Record<string, unknown> }[] {
    if (Array.isArray(ids)) {
      return ids.map((id) => ({ id, attrs: {} }));
    }
    return Object.entries(ids).map(([id, attrs]) => ({
      id: isNaN(Number(id)) ? id : Number(id),
      attrs,
    }));
  }

  private _buildPivotRows(
    ids: unknown | unknown[] | Record<string | number, Record<string, unknown>>,
    extra: Record<string, unknown>
  ): Record<string, unknown>[] {
    const parentId = this.getParentKey();

    if (ids === null || ids === undefined) return [];

    if (Array.isArray(ids)) {
      return ids.map((id) => ({
        [this.foreignPivotKey]: parentId,
        [this.relatedPivotKey]: id,
        ...extra,
      }));
    }

    if (typeof ids === 'object') {
      return Object.entries(ids as Record<string, unknown>).map(([id, attrs]) => ({
        [this.foreignPivotKey]: parentId,
        [this.relatedPivotKey]: isNaN(Number(id)) ? id : Number(id),
        ...(attrs as Record<string, unknown>),
        ...extra,
      }));
    }

    return [
      {
        [this.foreignPivotKey]: parentId,
        [this.relatedPivotKey]: ids,
        ...extra,
      },
    ];
  }
}
