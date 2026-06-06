import type { Model } from '../Model';
import { Collection } from '../Collection';
import { ModelCollection } from '../ModelCollection';
import { Relation, ModelConstructor } from './Relation';
import { MorphMap } from '../MorphMap';
import { PivotRecord } from './PivotRecord';

/**
 * Represents the inverse of a polymorphic many-to-many relationship.
 *
 * Here the **related** model is the morphable side (it owns the `_type` / `_id`
 * columns in the pivot table). The current model has a plain FK in the pivot.
 *
 * ```
 * tags >──< posts  via  taggables
 * taggables.taggable_type = 'Post'     ← class of the RELATED model
 * taggables.taggable_id   = post.id    ← FK to the RELATED model
 * taggables.tag_id        = tag.id     ← FK to the CURRENT model
 * ```
 *
 * @example
 * ```ts
 * class Tag extends Model {
 *   posts(): MorphedByMany<Post> {
 *     return this.morphedByMany(Post, 'taggable');
 *     // foreignPivotKey: tag_id
 *   }
 * }
 * ```
 */
export class MorphedByMany<TRelated extends object> extends Relation<TRelated> {
  readonly pivotTable: string;
  readonly relatedKey: string;

  private readonly morphTypeName: string;
  private readonly morphIdName: string;
  /** FK on the pivot pointing to the **current** model (e.g. `tag_id`). */
  private readonly foreignPivotKey: string;
  /** Class alias of the RELATED model stored in the type column. */
  private readonly relatedMorphClass: string;

  private _pivotColumns: string[] = [];
  private _pivotTimestamps = false;
  private _pivotAlias = 'pivot';

  constructor(
    relatedClass: ModelConstructor<TRelated>,
    parent: Model,
    pivotTable: string,
    morphName: string,
    foreignPivotKey: string,
    localKey: string,
    relatedKey: string
  ) {
    super(relatedClass, parent, foreignPivotKey, localKey);
    this.pivotTable = pivotTable;
    this.foreignPivotKey = foreignPivotKey;
    this.relatedKey = relatedKey;
    this.morphTypeName = `${morphName}_type`;
    this.morphIdName = `${morphName}_id`;
    this.relatedMorphClass = MorphMap.getAlias(relatedClass as unknown as Function);
  }

  // ── Configuration ─────────────────────────────────────────────────────────

  withPivot(...columns: string[]): this {
    this._pivotColumns.push(...columns);
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

  // ── Lazy load ─────────────────────────────────────────────────────────────

  async getResults(): Promise<Collection<TRelated>> {
    this._checkLazyLoading();
    this._applyJoin();
    this._qb.where(`${this.pivotTable}.${this.morphTypeName}`, this.relatedMorphClass);
    this._qb.where(`${this.pivotTable}.${this.foreignPivotKey}`, this.getParentKey());
    return this._fetchWithPivot();
  }

  // ── Eager load hooks ──────────────────────────────────────────────────────

  addEagerConstraints(parents: Model[]): void {
    this._applyJoin();
    const keys = this.collectKeys(parents, this.localKey);
    this._qb.where(`${this.pivotTable}.${this.morphTypeName}`, this.relatedMorphClass);
    this._qb.whereIn(`${this.pivotTable}.${this.foreignPivotKey}`, keys);
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

  async get(): Promise<ModelCollection<TRelated>> {
    return this._fetchWithPivot();
  }

  // ── Exists / Count SQL ────────────────────────────────────────────────────

  getExistsQuery(parentTable: string): string {
    return (
      `SELECT 1 FROM "${this.pivotTable}" ` +
      `WHERE "${this.pivotTable}"."${this.morphTypeName}" = '${this.relatedMorphClass}' ` +
      `AND "${this.pivotTable}"."${this.foreignPivotKey}" = "${parentTable}"."${this.localKey}"`
    );
  }

  getCountQuery(parentTable: string): string {
    return (
      `SELECT COUNT(*) FROM "${this.pivotTable}" ` +
      `WHERE "${this.pivotTable}"."${this.morphTypeName}" = '${this.relatedMorphClass}' ` +
      `AND "${this.pivotTable}"."${this.foreignPivotKey}" = "${parentTable}"."${this.localKey}"`
    );
  }

  // ── Pivot operations ──────────────────────────────────────────────────────

  async attach(
    ids: unknown | unknown[] | Record<string | number, Record<string, unknown>>,
    attributes: Record<string, unknown> = {}
  ): Promise<void> {
    const rows = this._buildPivotRows(ids, attributes);
    if (rows.length === 0) return;
    await this._qb.newQuery().from(this.pivotTable).insert(rows);
  }

  async detach(ids?: unknown | unknown[]): Promise<number> {
    const qb = this._qb
      .newQuery()
      .from(this.pivotTable)
      .where(this.morphTypeName, this.relatedMorphClass)
      .where(this.foreignPivotKey, this.getParentKey());
    if (ids !== undefined) {
      const arr = Array.isArray(ids) ? ids : [ids];
      qb.whereIn(this.morphIdName, arr);
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
      .where(this.morphTypeName, this.relatedMorphClass)
      .where(this.foreignPivotKey, this.getParentKey())
      .where(this.morphIdName, id)
      .update(attributes);
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private _applyJoin(): void {
    const relTable = this.modelClass.getTable();
    // JOIN pivot ON pivot.morphId = related.relatedKey
    const pivotMorphId = `${this.pivotTable}.${this.morphIdName}`;
    const relPk = `${relTable}.${this.relatedKey}`;

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

    this._qb.join(this.pivotTable, pivotMorphId, '=', relPk);
  }

  private async _fetchWithPivot(): Promise<ModelCollection<TRelated>> {
    // super.get() = ModelBuilder.get() — applies global scopes and hydrates rows
    const models = await super.get();

    for (const model of models) {
      const pivotData: Record<string, unknown> = {};
      const pivotKey = `pivot_${this.foreignPivotKey}`;
      pivotData[this.foreignPivotKey] = (model as any)._attributes[pivotKey];
      delete (model as any)._attributes[pivotKey];

      for (const col of this._pivotColumns) {
        const k = `pivot_${col}`;
        pivotData[col] = (model as any)._attributes[k];
        delete (model as any)._attributes[k];
      }

      if (this._pivotTimestamps) {
        for (const ts of ['created_at', 'updated_at']) {
          const k = `pivot_${ts}`;
          pivotData[ts] = (model as any)._attributes[k];
          delete (model as any)._attributes[k];
        }
      }

      (model as any)._relations[this._pivotAlias] = new PivotRecord(pivotData);
    }

    return models;
  }

  private async _currentIds(): Promise<unknown[]> {
    return this._qb
      .newQuery()
      .from(this.pivotTable)
      .where(this.morphTypeName, this.relatedMorphClass)
      .where(this.foreignPivotKey, this.getParentKey())
      .pluck(this.morphIdName);
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
      [this.morphTypeName]: this.relatedMorphClass,
      [this.foreignPivotKey]: parentId,
      ...extra,
    };

    if (ids === null || ids === undefined) return [];
    if (Array.isArray(ids)) return ids.map((id) => ({ ...base, [this.morphIdName]: id }));
    if (typeof ids === 'object') {
      return Object.entries(ids as Record<string, unknown>).map(([id, attrs]) => ({
        ...base,
        [this.morphIdName]: isNaN(Number(id)) ? id : Number(id),
        ...(attrs as Record<string, unknown>),
      }));
    }
    return [{ ...base, [this.morphIdName]: ids }];
  }
}
