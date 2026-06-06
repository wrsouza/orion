export type JoinType = 'INNER' | 'LEFT' | 'RIGHT' | 'CROSS';

export interface JoinCondition {
  type: 'column' | 'raw';
  first: string;
  operator: string;
  second: string;
  boolean: 'AND' | 'OR';
  sql?: string;
  bindings?: unknown[];
}

/**
 * Represents a JOIN clause with its ON conditions.
 * Conditions are collected via `on()`, `orOn()`, `onRaw()`.
 *
 * @example
 * ```ts
 * builder.join('roles', (join) => {
 *   join.on('users.role_id', '=', 'roles.id')
 *       .on('roles.active', '=', raw('TRUE'));
 * });
 * ```
 */
export class JoinClause {
  readonly type: JoinType;
  readonly table: string;
  readonly conditions: JoinCondition[] = [];

  constructor(type: JoinType, table: string) {
    this.type = type;
    this.table = table;
  }

  /**
   * Add an AND ON condition comparing two columns.
   */
  on(first: string, operator: string, second: string): this {
    this.conditions.push({ type: 'column', first, operator, second, boolean: 'AND' });
    return this;
  }

  /**
   * Add an OR ON condition comparing two columns.
   */
  orOn(first: string, operator: string, second: string): this {
    this.conditions.push({ type: 'column', first, operator, second, boolean: 'OR' });
    return this;
  }

  /**
   * Add a raw ON condition.
   * @param sql - Raw SQL string (use driver-specific placeholders if needed).
   * @param bindings - Bound values for any placeholders in `sql`.
   */
  onRaw(sql: string, bindings: unknown[] = []): this {
    this.conditions.push({
      type: 'raw',
      first: '',
      operator: '',
      second: '',
      boolean: 'AND',
      sql,
      bindings,
    });
    return this;
  }
}
