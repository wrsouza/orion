import { Connection, QueryResult } from '../connection/Connection';
import { Expression } from './Expression';
import { JoinClause, JoinType } from './JoinClause';
import { PostgresQueryGrammar } from './grammars/PostgresQueryGrammar';
import { QueryGrammar } from './grammars/QueryGrammar';
import { QueryException } from './QueryException';

// ── Internal state types ───────────────────────────────────────────────────

export type WhereType =
  | 'basic'
  | 'in'
  | 'notIn'
  | 'null'
  | 'notNull'
  | 'between'
  | 'notBetween'
  | 'column'
  | 'nested'
  | 'raw'
  | 'exists'
  | 'notExists'
  | 'inSubQuery'
  | 'notInSubQuery';

export interface WhereClause {
  type: WhereType;
  boolean: 'AND' | 'OR';
  column?: string;
  operator?: string;
  value?: unknown;
  values?: unknown[];
  nested?: WhereClause[];
  rawSql?: string;
  rawBindings?: unknown[];
  subQuery?: QueryBuilder;
}

export interface OrderClause {
  type: 'column' | 'raw';
  column?: string;
  direction?: 'asc' | 'desc';
  rawSql?: string;
  rawBindings?: unknown[];
}

export interface HavingClause {
  type: 'basic' | 'raw';
  boolean: 'AND' | 'OR';
  column?: string;
  operator?: string;
  value?: unknown;
  rawSql?: string;
  rawBindings?: unknown[];
}

export interface AggregateState {
  fn: string;
  column: string;
}

type _WhereTuple = [string, unknown] | [string, string, unknown];

type WhereCallback = (builder: QueryBuilder) => void;

const OPERATORS = new Set([
  '=',
  '<',
  '>',
  '<=',
  '>=',
  '<>',
  '!=',
  'like',
  'ilike',
  'not like',
  'not ilike',
  '~',
  '~*',
  '!~',
  '!~*',
  '@>',
  '<@',
  '&&',
]);

/**
 * Fluent SQL query builder.
 *
 * Every method returns `this` for chaining. Call `get()`, `first()`, or any
 * terminal method to execute the query and return results.
 *
 * @example
 * ```ts
 * const users = await new QueryBuilder(connection)
 *   .from('users')
 *   .where('active', true)
 *   .where('age', '>=', 18)
 *   .orderBy('name')
 *   .limit(20)
 *   .get();
 * ```
 */
export class QueryBuilder {
  // Public state consumed by the grammar
  fromTable: string | Expression | null = null;
  columns: (string | Expression)[] = [];
  joins: JoinClause[] = [];
  wheres: WhereClause[] = [];
  groups: string[] = [];
  havings: HavingClause[] = [];
  orders: OrderClause[] = [];
  limitValue: number | null = null;
  offsetValue: number | null = null;
  isDistinct = false;
  aggregate: AggregateState | null = null;
  lockMode: string | null = null;
  primaryKey = 'id';

  private readonly connection: Connection;
  private readonly grammar: QueryGrammar;

  constructor(connection: Connection, grammar?: QueryGrammar) {
    this.connection = connection;
    this.grammar = grammar ?? new PostgresQueryGrammar();
  }

  // ── FROM ──────────────────────────────────────────────────────────────────

  /** Set the table to query. Accepts an alias: `'users as u'`. */
  from(table: string | Expression): this {
    this.fromTable = table;
    return this;
  }

  // ── SELECT ────────────────────────────────────────────────────────────────

  /**
   * Set the columns to select.
   * Supports aliases (`'name as full_name'`), raw expressions, and `*`.
   */
  select(...columns: (string | Expression)[]): this {
    this.columns = columns.flat() as (string | Expression)[];
    return this;
  }

  /** Append columns to an existing select list. */
  addSelect(...columns: (string | Expression)[]): this {
    this.columns.push(...(columns.flat() as (string | Expression)[]));
    return this;
  }

  /** Add a raw SQL fragment to the select list. */
  selectRaw(sql: string, bindings: unknown[] = []): this {
    // bindings are embedded into the expression for the grammar
    const expr = bindings.length
      ? new Expression(sql) // grammar handles the raw with its binding collector
      : new Expression(sql);
    return this.addSelect(expr);
  }

  /** Select only distinct rows. */
  distinct(): this {
    this.isDistinct = true;
    return this;
  }

  // ── WHERE ─────────────────────────────────────────────────────────────────

  /**
   * Add a WHERE condition.
   *
   * Overloads:
   * - `where('active', true)` — equality shorthand
   * - `where('age', '>=', 18)` — explicit operator
   * - `where(q => q.where(...).orWhere(...))` — grouped / nested
   */
  where(column: string | WhereCallback, operatorOrValue?: unknown, value?: unknown): this {
    return this.addWhere(column, operatorOrValue, value, 'AND');
  }

  /** Add an OR WHERE condition. Same overloads as `where()`. */
  orWhere(column: string | WhereCallback, operatorOrValue?: unknown, value?: unknown): this {
    return this.addWhere(column, operatorOrValue, value, 'OR');
  }

  private addWhere(
    column: string | WhereCallback,
    operatorOrValue: unknown,
    value: unknown,
    boolean: 'AND' | 'OR'
  ): this {
    if (typeof column === 'function') {
      const nested = this.clone();
      nested.wheres = [];
      column(nested);
      this.wheres.push({ type: 'nested', boolean, nested: nested.wheres });
      return this;
    }

    let operator: string;
    let val: unknown;

    if (value === undefined) {
      operator = '=';
      val = operatorOrValue;
    } else {
      operator = String(operatorOrValue).toLowerCase();
      val = value;

      if (!OPERATORS.has(operator)) {
        throw new Error(`[orion] Invalid operator: "${operator}"`);
      }
    }

    this.wheres.push({ type: 'basic', boolean, column, operator, value: val });
    return this;
  }

  /** `WHERE column IN (values)` */
  whereIn(column: string, values: unknown[] | QueryBuilder): this {
    return this.addWhereIn(column, values, 'AND', false);
  }

  /** `OR WHERE column IN (values)` */
  orWhereIn(column: string, values: unknown[] | QueryBuilder): this {
    return this.addWhereIn(column, values, 'OR', false);
  }

  /** `WHERE column NOT IN (values)` */
  whereNotIn(column: string, values: unknown[] | QueryBuilder): this {
    return this.addWhereIn(column, values, 'AND', true);
  }

  /** `OR WHERE column NOT IN (values)` */
  orWhereNotIn(column: string, values: unknown[] | QueryBuilder): this {
    return this.addWhereIn(column, values, 'OR', true);
  }

  private addWhereIn(
    column: string,
    values: unknown[] | QueryBuilder,
    boolean: 'AND' | 'OR',
    negate: boolean
  ): this {
    if (values instanceof QueryBuilder) {
      const type = negate ? 'notInSubQuery' : 'inSubQuery';
      this.wheres.push({ type, boolean, column, subQuery: values });
    } else {
      const type = negate ? 'notIn' : 'in';
      this.wheres.push({ type, boolean, column, values });
    }
    return this;
  }

  /** `WHERE column IS NULL` */
  whereNull(column: string): this {
    this.wheres.push({ type: 'null', boolean: 'AND', column });
    return this;
  }

  /** `OR WHERE column IS NULL` */
  orWhereNull(column: string): this {
    this.wheres.push({ type: 'null', boolean: 'OR', column });
    return this;
  }

  /** `WHERE column IS NOT NULL` */
  whereNotNull(column: string): this {
    this.wheres.push({ type: 'notNull', boolean: 'AND', column });
    return this;
  }

  /** `OR WHERE column IS NOT NULL` */
  orWhereNotNull(column: string): this {
    this.wheres.push({ type: 'notNull', boolean: 'OR', column });
    return this;
  }

  /** `WHERE column BETWEEN min AND max` */
  whereBetween(column: string, range: [unknown, unknown]): this {
    this.wheres.push({ type: 'between', boolean: 'AND', column, values: range });
    return this;
  }

  /** `WHERE column NOT BETWEEN min AND max` */
  whereNotBetween(column: string, range: [unknown, unknown]): this {
    this.wheres.push({ type: 'notBetween', boolean: 'AND', column, values: range });
    return this;
  }

  /** `WHERE first operator second` — compares two columns, no binding. */
  whereColumn(first: string, operatorOrSecond: string, second?: string): this {
    const operator = second === undefined ? '=' : operatorOrSecond;
    const col2 = second ?? operatorOrSecond;
    this.wheres.push({ type: 'column', boolean: 'AND', column: first, operator, value: col2 });
    return this;
  }

  /** `OR WHERE first operator second` */
  orWhereColumn(first: string, operatorOrSecond: string, second?: string): this {
    const operator = second === undefined ? '=' : operatorOrSecond;
    const col2 = second ?? operatorOrSecond;
    this.wheres.push({ type: 'column', boolean: 'OR', column: first, operator, value: col2 });
    return this;
  }

  /** Inject a raw SQL fragment into the WHERE clause. */
  whereRaw(sql: string, bindings: unknown[] = []): this {
    this.wheres.push({ type: 'raw', boolean: 'AND', rawSql: sql, rawBindings: bindings });
    return this;
  }

  /** `OR` raw WHERE fragment. */
  orWhereRaw(sql: string, bindings: unknown[] = []): this {
    this.wheres.push({ type: 'raw', boolean: 'OR', rawSql: sql, rawBindings: bindings });
    return this;
  }

  /** `WHERE EXISTS (subquery)` */
  whereExists(callback: (q: QueryBuilder) => void): this {
    const sub = this.newQuery();
    callback(sub);
    this.wheres.push({ type: 'exists', boolean: 'AND', subQuery: sub });
    return this;
  }

  /** `WHERE NOT EXISTS (subquery)` */
  whereNotExists(callback: (q: QueryBuilder) => void): this {
    const sub = this.newQuery();
    callback(sub);
    this.wheres.push({ type: 'notExists', boolean: 'AND', subQuery: sub });
    return this;
  }

  // ── JOIN ──────────────────────────────────────────────────────────────────

  /** `INNER JOIN table ON first operator second` */
  join(
    table: string,
    firstOrCallback: string | ((join: JoinClause) => void),
    operator?: string,
    second?: string
  ): this {
    return this.addJoin('INNER', table, firstOrCallback, operator, second);
  }

  /** `LEFT JOIN` */
  leftJoin(
    table: string,
    firstOrCallback: string | ((join: JoinClause) => void),
    operator?: string,
    second?: string
  ): this {
    return this.addJoin('LEFT', table, firstOrCallback, operator, second);
  }

  /** `RIGHT JOIN` */
  rightJoin(
    table: string,
    firstOrCallback: string | ((join: JoinClause) => void),
    operator?: string,
    second?: string
  ): this {
    return this.addJoin('RIGHT', table, firstOrCallback, operator, second);
  }

  /** `CROSS JOIN` — no ON condition. */
  crossJoin(table: string): this {
    const clause = new JoinClause('CROSS', table);
    this.joins.push(clause);
    return this;
  }

  private addJoin(
    type: JoinType,
    table: string,
    firstOrCallback: string | ((join: JoinClause) => void),
    operator?: string,
    second?: string
  ): this {
    const clause = new JoinClause(type, table);

    if (typeof firstOrCallback === 'function') {
      firstOrCallback(clause);
    } else {
      clause.on(firstOrCallback, operator ?? '=', second ?? '');
    }

    this.joins.push(clause);
    return this;
  }

  // ── ORDER BY ──────────────────────────────────────────────────────────────

  /** `ORDER BY column direction` */
  orderBy(column: string, direction: 'asc' | 'desc' = 'asc'): this {
    this.orders.push({ type: 'column', column, direction });
    return this;
  }

  /** `ORDER BY column DESC` */
  orderByDesc(column: string): this {
    return this.orderBy(column, 'desc');
  }

  /** `ORDER BY created_at DESC` */
  latest(column = 'created_at'): this {
    return this.orderByDesc(column);
  }

  /** `ORDER BY created_at ASC` */
  oldest(column = 'created_at'): this {
    return this.orderBy(column, 'asc');
  }

  /** Raw ORDER BY fragment. */
  orderByRaw(sql: string, bindings: unknown[] = []): this {
    this.orders.push({ type: 'raw', rawSql: sql, rawBindings: bindings });
    return this;
  }

  // ── GROUP BY / HAVING ─────────────────────────────────────────────────────

  /** `GROUP BY columns` */
  groupBy(...columns: string[]): this {
    this.groups.push(...columns.flat());
    return this;
  }

  /** `HAVING column operator value` */
  having(column: string, operator: string, value: unknown): this {
    this.havings.push({ type: 'basic', boolean: 'AND', column, operator, value });
    return this;
  }

  /** `OR HAVING column operator value` */
  orHaving(column: string, operator: string, value: unknown): this {
    this.havings.push({ type: 'basic', boolean: 'OR', column, operator, value });
    return this;
  }

  /** Raw HAVING fragment. */
  havingRaw(sql: string, bindings: unknown[] = []): this {
    this.havings.push({ type: 'raw', boolean: 'AND', rawSql: sql, rawBindings: bindings });
    return this;
  }

  // ── LIMIT / OFFSET ────────────────────────────────────────────────────────

  limit(value: number): this {
    this.limitValue = value;
    return this;
  }

  offset(value: number): this {
    this.offsetValue = value;
    return this;
  }

  /** Alias for `offset`. */
  skip(value: number): this {
    return this.offset(value);
  }

  /** Alias for `limit`. */
  take(value: number): this {
    return this.limit(value);
  }

  /** Convenience: set both `limit` and `offset` for page-based pagination. */
  forPage(page: number, perPage = 15): this {
    return this.offset((page - 1) * perPage).limit(perPage);
  }

  // ── LOCKING ───────────────────────────────────────────────────────────────

  /** Append `FOR UPDATE` to the SELECT (pessimistic write lock). */
  lockForUpdate(): this {
    this.lockMode = 'FOR UPDATE';
    return this;
  }

  /** Append `FOR SHARE` to the SELECT (pessimistic read lock). */
  sharedLock(): this {
    this.lockMode = 'FOR SHARE';
    return this;
  }

  // ── EXECUTION — READ ──────────────────────────────────────────────────────

  private async runQuery(sql: string, bindings: unknown[]): Promise<QueryResult> {
    try {
      return await this.connection.query(sql, bindings);
    } catch (err) {
      throw new QueryException(sql, bindings, err instanceof Error ? err : new Error(String(err)));
    }
  }

  /** Execute the query and return all matching rows. */
  async get(): Promise<Record<string, unknown>[]> {
    const { sql, bindings } = this.grammar.compileSelect(this);
    const result = await this.runQuery(sql, bindings);
    return result.rows;
  }

  /** Return the first matching row, or `null` if none found. */
  async first(): Promise<Record<string, unknown> | null> {
    const rows = await this.clone().limit(1).get();
    return rows[0] ?? null;
  }

  /** Return the first row or throw if none found. */
  async firstOrFail(): Promise<Record<string, unknown>> {
    const row = await this.first();
    if (!row) throw new Error('[orion] No records found.');
    return row;
  }

  /** Find a single row by primary key. */
  async find(id: unknown, columns: string[] = ['*']): Promise<Record<string, unknown> | null> {
    return this.clone()
      .where(this.primaryKey, id)
      .select(...columns)
      .first();
  }

  /**
   * Return a single column value from the first row.
   * @example `const name = await builder.value('name')`
   */
  async value(column: string): Promise<unknown> {
    const row = await this.clone().select(column).first();
    if (!row) return null;
    return row[column] ?? null;
  }

  /**
   * Return an array of values for a single column across all rows.
   * @example `const ids = await builder.pluck('id')`
   */
  async pluck(column: string): Promise<unknown[]> {
    const rows = await this.clone().select(column).get();
    return rows.map((r) => r[column]);
  }

  /** Return `true` if at least one row matches the query. */
  async exists(): Promise<boolean> {
    const { sql, bindings } = this.grammar.compileSelect(
      this.clone().select(new Expression('1')).limit(1)
    );
    const result = await this.runQuery(sql, bindings);
    return result.rowCount > 0;
  }

  /** Return `true` if no rows match the query. */
  async doesntExist(): Promise<boolean> {
    return !(await this.exists());
  }

  /**
   * Paginate results in chunks to avoid loading all rows into memory.
   * @param size - Number of rows per chunk.
   * @param callback - Called for each chunk; return `false` to stop iteration.
   */
  async chunk(
    size: number,
    callback: (rows: Record<string, unknown>[]) => Promise<boolean | void> | boolean | void
  ): Promise<void> {
    let page = 1;

    while (true) {
      const rows = await this.clone().forPage(page, size).get();
      if (!rows.length) break;

      const result = await callback(rows);
      if (result === false) break;
      if (rows.length < size) break;

      page++;
    }
  }

  /**
   * Iterate rows one by one using an async generator — minimal memory overhead.
   * @example
   * ```ts
   * for await (const user of builder.cursor()) {
   *   console.log(user.name);
   * }
   * ```
   */
  async *cursor(): AsyncGenerator<Record<string, unknown>> {
    const { sql, bindings } = this.grammar.compileSelect(this);
    const result = await this.runQuery(sql, bindings);
    for (const row of result.rows) {
      yield row;
    }
  }

  // ── AGGREGATES ────────────────────────────────────────────────────────────

  async count(column = '*'): Promise<number> {
    return this.runAggregate('COUNT', column);
  }

  async sum(column: string): Promise<number> {
    return this.runAggregate('SUM', column);
  }

  async min(column: string): Promise<number> {
    return this.runAggregate('MIN', column);
  }

  async max(column: string): Promise<number> {
    return this.runAggregate('MAX', column);
  }

  async avg(column: string): Promise<number> {
    return this.runAggregate('AVG', column);
  }

  /** Alias for `avg`. */
  async average(column: string): Promise<number> {
    return this.avg(column);
  }

  private async runAggregate(fn: string, column: string): Promise<number> {
    const { sql, bindings } = this.grammar.compileAggregate(this, fn, column);
    const result = await this.runQuery(sql, bindings);
    const val = result.rows[0]?.['aggregate'];
    return val === null || val === undefined ? 0 : Number(val);
  }

  // ── EXECUTION — WRITE ─────────────────────────────────────────────────────

  /**
   * Insert one or more rows.
   * @returns Number of rows inserted.
   */
  async insert(values: Record<string, unknown> | Record<string, unknown>[]): Promise<number> {
    const rows = Array.isArray(values) ? values : [values];
    const { sql, bindings } = this.grammar.compileInsert(this, rows);
    const result = await this.runQuery(sql, bindings);
    return result.rowCount;
  }

  /**
   * Insert a single row and return its generated primary key value.
   */
  async insertGetId(values: Record<string, unknown>): Promise<unknown> {
    const { sql, bindings } = this.grammar.compileInsertGetId(this, values);
    const result = await this.runQuery(sql, bindings);
    return result.rows[0]?.[this.primaryKey] ?? result.lastInsertRowid ?? null;
  }

  /**
   * Insert rows, ignoring conflicts (no error thrown on duplicates).
   */
  async insertOrIgnore(
    values: Record<string, unknown> | Record<string, unknown>[]
  ): Promise<number> {
    const rows = Array.isArray(values) ? values : [values];
    const { sql, bindings } = this.grammar.compileInsertOrIgnore(this, rows);
    const result = await this.runQuery(sql, bindings);
    return result.rowCount;
  }

  /**
   * Insert or update rows in a single atomic operation.
   * @param values - Rows to insert or update.
   * @param uniqueBy - Columns that identify a conflict.
   * @param updateColumns - Columns to update on conflict.
   */
  async upsert(
    values: Record<string, unknown>[],
    uniqueBy: string[],
    updateColumns: string[]
  ): Promise<number> {
    const { sql, bindings } = this.grammar.compileUpsert(this, values, uniqueBy, updateColumns);
    const result = await this.runQuery(sql, bindings);
    return result.rowCount;
  }

  /**
   * Update rows matching the current WHERE clause.
   * @returns Number of rows affected.
   */
  async update(values: Record<string, unknown>): Promise<number> {
    const { sql, bindings } = this.grammar.compileUpdate(this, values);
    const result = await this.runQuery(sql, bindings);
    return result.rowCount;
  }

  /**
   * Increment a numeric column by `amount` (default: 1).
   * Additional columns may be updated in the same statement.
   */
  async increment(
    column: string,
    amount = 1,
    extra: Record<string, unknown> = {}
  ): Promise<number> {
    const values: Record<string, unknown> = {
      ...extra,
      [column]: new Expression(`${this.grammar.wrap(column)} + ${amount}`),
    };
    return this.update(values);
  }

  /**
   * Decrement a numeric column by `amount` (default: 1).
   */
  async decrement(
    column: string,
    amount = 1,
    extra: Record<string, unknown> = {}
  ): Promise<number> {
    return this.increment(column, -amount, extra);
  }

  /**
   * Delete rows matching the current WHERE clause.
   * @returns Number of rows deleted.
   */
  async delete(): Promise<number> {
    const { sql, bindings } = this.grammar.compileDelete(this);
    const result = await this.runQuery(sql, bindings);
    return result.rowCount;
  }

  /**
   * Remove all rows from the table and reset the identity sequence.
   * **This cannot be rolled back.**
   */
  async truncate(): Promise<void> {
    const { sql, bindings } = this.grammar.compileTruncate(this.fromTable as string);
    await this.runQuery(sql, bindings);
  }

  // ── INTROSPECTION ─────────────────────────────────────────────────────────

  /**
   * Return the compiled SQL and bindings without executing.
   * Useful for debugging or logging.
   */
  toSql(): { sql: string; bindings: unknown[] } {
    return this.grammar.compileSelect(this);
  }

  /**
   * Print the compiled SQL to stdout and return `this` for continued chaining.
   */
  dump(): this {
    const { sql, bindings } = this.toSql();
    console.log('[orion] SQL:', sql);
    console.log('[orion] Bindings:', bindings);
    return this;
  }

  // ── UTILITIES ─────────────────────────────────────────────────────────────

  /**
   * Create a deep copy of this builder, sharing the same connection and grammar.
   * The copy is completely independent — mutating it does not affect the original.
   */
  clone(): QueryBuilder {
    const copy = new QueryBuilder(this.connection, this.grammar);
    copy.fromTable = this.fromTable;
    copy.columns = [...this.columns];
    copy.joins = this.joins.map((j) => Object.assign(Object.create(Object.getPrototypeOf(j)), j));
    copy.wheres = this.wheres.map((w) => ({ ...w }));
    copy.groups = [...this.groups];
    copy.havings = [...this.havings];
    copy.orders = [...this.orders];
    copy.limitValue = this.limitValue;
    copy.offsetValue = this.offsetValue;
    copy.isDistinct = this.isDistinct;
    copy.aggregate = this.aggregate ? { ...this.aggregate } : null;
    copy.lockMode = this.lockMode;
    copy.primaryKey = this.primaryKey;
    return copy;
  }

  /** Create a new empty builder sharing this builder's connection and grammar. */
  newQuery(): QueryBuilder {
    return new QueryBuilder(this.connection, this.grammar);
  }
}
