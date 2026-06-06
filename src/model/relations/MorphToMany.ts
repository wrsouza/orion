import type { Model } from '../Model';
import { Collection } from '../Collection';
import { ModelCollection } from '../ModelCollection';
import { Relation, ModelConstructor } from './Relation';
import { MorphMap } from '../MorphMap';
import { PivotRecord } from './PivotRecord';

/**
 * Represents a polymorphic many-to-many relationship where the **current**
 * model is the morphable side (i.e. it owns the `_type` / `_id` columns in
 * the pivot table).
 *
 * ```
 * posts >──< tags  via  taggables
 * taggables.taggable_type = 'Post'
 * taggables.taggable_id   = post.id    ← morphId  (FK to current model)
 * taggables.tag_id        = tag.id     ← relatedPivotKey
 * ```
 *
 * @example
 * ```ts
 * class Post extends Model {
 *   tags(): MorphToMany<Tag> {
 *     return this.morphToMany(Tag, 'taggable');
 *     // pivot:           taggables
 *     // relatedPivotKey: tag_id
 *   }
 * }
 * ```
 */
export class MorphToMany<TRelated extends object> extends Relation<TRelated> {
  readonly pivotTable: string;
  readonly relatedPivotKey: string;
  readonly relatedKey: string;

  protected readonly morphTypeName: string;
  protected readonly morphIdName: string;
  protected readonly morphClass: string;

  private _pivotColumns: string[] = [];
  private _pivotTimestamps = false;
  private _pivotAlias = 'pivot';
  private _pivotValues: Record<string, unknown> = {};

  constructor(
    relatedClass: ModelConstructor<TRelated>,
    parent: Model,
    pivotTable: string,
    morphName: string,
    relatedPivotKey: string,
    localKey: string,
    relatedKey: string
  ) {
    super(relatedClass, parent, `${morphName}_id`, localKey);
    this.pivotTable = pivotTable;
    this.relatedPivotKey = relatedPivotKey;
    this.relatedKey = relatedKey;
    this.morphTypeName = `${morphName}_type`;
    this.morphIdName = `${morphName}_id`;
    this.morphClass = MorphMap.getAlias(parent.constructor as Function);
  }

  // ── Configuration ─────────────────────────────────────────────────────────

  withPivot(...columns: string[]): this {
    this._pivotColumns.push(...columns);
    return this;
  }

  withPivotValue(column: string, value: unknown): this {
    this._pivotValues[column] = value;
    return this;
  }

  withTimestamps(): this {
    this._pivotTimestamps = true;
    return this;
  }

  as(alias: string): this {
    this._pivotAlias = alias;
    return this;
  }

  wherePivot(column: string, operatorOrValue: unknown, value?: unknown): this {
    if (value !== undefined) {
      this.where(`${this.pivotTable}.${column}`, operatorOrValue, value);
    } else {
      this.where(`${this.pivotTable}.${column}`, operatorOrValue);
    }
    return this;
  }

  wherePivotIn(column: string, values: unknown[]): this {
    this.whereIn(`${this.pivotTable}.${column}`, values);
    return this;
  }

  wherePivotNotIn(column: string, values: unknown[]): this {
    this.whereNotIn(`${this.pivotTable}.${column}`, values);
    return this;
  }

  wherePivotBetween(column: string, range: [unknown, unknown]): this {
    this.whereBetween(`${this.pivotTable}.${column}`, range);
    return this;
  }

  wherePivotNotBetween(column: string, range: [unknown, unknown]): this {
    this.whereNotBetween(`${this.pivotTable}.${column}`, range);
    return this;
  }

  wherePivotNull(column: string): this {
    this.whereNull(`${this.pivotTable}.${column}`);
    return this;
  }

  wherePivotNotNull(column: string): this {
    this.whereNotNull(`${this.pivotTable}.${column}`);
    return this;
  }

  orderByPivot(column: string, direction: 'asc' | 'desc' = 'asc'): this {
    this.orderBy(`${this.pivotTable}.${column}`, direction);
    return this;
  }

  orderByPivotDesc(column: string): this {
    return this.orderByPivot(column, 'desc');
  }

  async syncWithoutDetaching(
    ids: unknown[] | Record<string | number, Record<string, unknown>>
  ): Promise<{ attached: unknown[]; detached: unknown[]; updated: unknown[] }> {
    return this.sync(ids, false);
  }

  // ── Lazy load ─────────────────────────────────────────────────────────────

  async getResults(): Promise<Collection<TRelated>> {
    this._checkLazyLoading();
    this._applyJoin();
    this._qb.where(`${this.pivotTable}.${this.morphTypeName}`, this.morphClass);
    this._qb.where(`${this.pivotTable}.${this.morphIdName}`, this.getParentKey());
    return this._fetchWithPivot();
  }

  // ── Eager load hooks ──────────────────────────────────────────────────────

  addEagerConstraints(parents: Model[]): void {
    this._applyJoin();
    const keys = this.collectKeys(parents, this.localKey);
    this._qb.where(`${this.pivotTable}.${this.morphTypeName}`, this.morphClass);
    this._qb.whereIn(`${this.pivotTable}.${this.morphIdName}`, keys);
  }

  initRelation(parents: Model[], relation: string): Model[] {
    for (const parent of parents) {
      (parent as any)._relations[relation] = new ModelCollection([], this.modelClass as any);
    }
    return parents;
  }

  match(parents: Model[], results: Collection<TRelated>, relation: string): Model[] {
    const dict = new Map<unknown, TRelated[]>();
    for (const related of results) {
      const fk = (related as any)._attributes[`pivot_${this.morphIdName}`];
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

  async get(): Promise<ModelCollection<TRelated>> {
    return this._fetchWithPivot();
  }

  // ── Exists / Count SQL ────────────────────────────────────────────────────

  getExistsQuery(parentTable: string): string {
    return (
      `SELECT 1 FROM "${this.pivotTable}" ` +
      `WHERE "${this.pivotTable}"."${this.morphTypeName}" = '${this.morphClass}' ` +
      `AND "${this.pivotTable}"."${this.morphIdName}" = "${parentTable}"."${this.localKey}"`
    );
  }

  getCountQuery(parentTable: string): string {
    return (
      `SELECT COUNT(*) FROM "${this.pivotTable}" ` +
      `WHERE "${this.pivotTable}"."${this.morphTypeName}" = '${this.morphClass}' ` +
      `AND "${this.pivotTable}"."${this.morphIdName}" = "${parentTable}"."${this.localKey}"`
    );
  }

  // ── Pivot operations ──────────────────────────────────────────────────────

  async attach(
    ids: unknown | unknown[] | Record<string | number, Record<string, unknown>>,
    attributes: Record<string, unknown> = {}
  ): Promise<void> {
    const rows = this._buildPivotRows(ids, { ...this._pivotValues, ...attributes });
    if (rows.length === 0) return;
    await this._qb.newQuery().from(this.pivotTable).insert(rows);
  }

  async detach(ids?: unknown | unknown[]): Promise<number> {
    const qb = this._qb
      .newQuery()
      .from(this.pivotTable)
      .where(this.morphTypeName, this.morphClass)
      .where(this.morphIdName, this.getParentKey());
    if (ids !== undefined) {
      const arr = Array.isArray(ids) ? ids : [ids];
      qb.whereIn(this.relatedPivotKey, arr);
    }
    return qb.delete();
  }

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

    for (const row of desired) {
      if (!current.includes(row.id)) {
        await this.attach(row.id, row.attrs);
        attached.push(row.id);
      } else if (Object.keys(row.attrs).length > 0) {
        await this.updateExistingPivot(row.id, row.attrs);
        updated.push(row.id);
      }
    }

    if (detaching) {
      const toDetach = current.filter((id) => !desiredIds.includes(id));
      if (toDetach.length) {
        await this.detach(toDetach);
        detached.push(...toDetach);
      }
    }

    return { attached, detached, updated };
  }

  async toggle(ids: unknown | unknown[]): Promise<{ attached: unknown[]; detached: unknown[] }> {
    const current = await this._currentIds();
    const arr = Array.isArray(ids) ? ids : [ids];
    const toAttach = arr.filter((id) => !current.includes(id));
    const toDetach = arr.filter((id) => current.includes(id));
    if (toAttach.length) await this.attach(toAttach);
    if (toDetach.length) await this.detach(toDetach);
    return { attached: toAttach, detached: toDetach };
  }

  async syncWithPivotValues(
    ids: unknown[],
    pivotValues: Record<string, unknown>,
    detaching = true
  ): Promise<{ attached: unknown[]; detached: unknown[]; updated: unknown[] }> {
    const map: Record<string | number, Record<string, unknown>> = {};
    for (const id of ids) map[id as string | number] = { ...pivotValues };
    return this.sync(map, detaching);
  }

  async updateExistingPivot(id: unknown, attributes: Record<string, unknown>): Promise<number> {
    return this._qb
      .newQuery()
      .from(this.pivotTable)
      .where(this.morphTypeName, this.morphClass)
      .where(this.morphIdName, this.getParentKey())
      .where(this.relatedPivotKey, id)
      .update(attributes);
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  protected _applyJoin(): void {
    const relTable = this.modelClass.getTable();
    const pivotFk = `${this.pivotTable}.${this.relatedPivotKey}`;
    const relPk = `${relTable}.${this.relatedKey}`;

    this.selectRaw(`"${relTable}".*`);
    this.selectRaw(`"${this.pivotTable}"."${this.morphIdName}" AS "pivot_${this.morphIdName}"`);

    for (const col of this._pivotColumns) {
      this.selectRaw(`"${this.pivotTable}"."${col}" AS "pivot_${col}"`);
    }

    if (this._pivotTimestamps) {
      this.selectRaw(`"${this.pivotTable}"."created_at" AS "pivot_created_at"`);
      this.selectRaw(`"${this.pivotTable}"."updated_at" AS "pivot_updated_at"`);
    }

    this._qb.join(this.pivotTable, pivotFk, '=', relPk);
  }

  private async _fetchWithPivot(): Promise<ModelCollection<TRelated>> {
    const results = await super.get();

    for (const model of results) {
      const pivotData: Record<string, unknown> = {};
      const keepCols = [this.morphIdName, ...this._pivotColumns];

      for (const col of keepCols) {
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
    return this._qb
      .newQuery()
      .from(this.pivotTable)
      .where(this.morphTypeName, this.morphClass)
      .where(this.morphIdName, this.getParentKey())
      .pluck(this.relatedPivotKey);
  }

  private _normaliseIds(
    ids: unknown[] | Record<string | number, Record<string, unknown>>
  ): { id: unknown; attrs: Record<string, unknown> }[] {
    if (Array.isArray(ids)) return ids.map((id) => ({ id, attrs: {} }));
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
    const base = {
      [this.morphTypeName]: this.morphClass,
      [this.morphIdName]: parentId,
      ...extra,
    };

    if (ids === null || ids === undefined) return [];

    if (Array.isArray(ids)) {
      return ids.map((id) => ({ ...base, [this.relatedPivotKey]: id }));
    }

    if (typeof ids === 'object') {
      return Object.entries(ids as Record<string, unknown>).map(([id, attrs]) => ({
        ...base,
        [this.relatedPivotKey]: isNaN(Number(id)) ? id : Number(id),
        ...(attrs as Record<string, unknown>),
      }));
    }

    return [{ ...base, [this.relatedPivotKey]: ids }];
  }
}
