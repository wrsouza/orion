import { Expression } from '../Expression';
import { JoinClause } from '../JoinClause';
import {
  AggregateState,
  HavingClause,
  OrderClause,
  QueryBuilder,
  WhereClause,
} from '../QueryBuilder';
import { CompiledQuery, QueryGrammar } from './QueryGrammar';

/**
 * Compiles `QueryBuilder` state into MySQL-flavoured SQL.
 *
 * MySQL uses positional `?` parameters and backtick identifier quoting.
 * INSERT … RETURNING is not available — `insertGetId` uses `LAST_INSERT_ID()`.
 * Upsert uses `INSERT … ON DUPLICATE KEY UPDATE`.
 * TRUNCATE does not accept CASCADE.
 */
export class MySQLQueryGrammar implements QueryGrammar {
  // ── SELECT ────────────────────────────────────────────────────────────────

  compileSelect(builder: QueryBuilder): CompiledQuery {
    const b = new BindingCollector();
    const parts: string[] = [];

    parts.push(this.compileColumns(builder));
    parts.push(`FROM ${this.compileFrom(builder)}`);

    if (builder.joins.length) parts.push(this.compileJoins(builder.joins, b));
    if (builder.wheres.length) parts.push(`WHERE ${this.compileWheres(builder.wheres, b)}`);
    if (builder.groups.length) parts.push(`GROUP BY ${this.compileGroups(builder.groups)}`);
    if (builder.havings.length) parts.push(`HAVING ${this.compileHavings(builder.havings, b)}`);
    if (builder.orders.length) parts.push(`ORDER BY ${this.compileOrders(builder.orders, b)}`);
    if (builder.limitValue !== null) parts.push(`LIMIT ${builder.limitValue}`);
    if (builder.offsetValue !== null) parts.push(`OFFSET ${builder.offsetValue}`);

    if (builder.lockMode) {
      // Translate Postgres lock modes to MySQL equivalents
      const lock =
        builder.lockMode === 'FOR UPDATE'
          ? 'FOR UPDATE'
          : builder.lockMode === 'FOR SHARE'
            ? 'LOCK IN SHARE MODE'
            : builder.lockMode;
      parts.push(lock);
    }

    return { sql: parts.join(' '), bindings: b.all() };
  }

  // ── INSERT ────────────────────────────────────────────────────────────────

  compileInsert(builder: QueryBuilder, values: Record<string, unknown>[]): CompiledQuery {
    const b = new BindingCollector();
    const table = this.wrap(builder.fromTable as string);
    const columns = Object.keys(values[0]);
    const colsSql = columns.map((c) => this.wrap(c)).join(', ');

    const rowsSql = values
      .map((row) => {
        const placeholders = columns.map((col) => {
          const val = row[col];
          return val instanceof Expression ? val.getValue() : b.add(val);
        });
        return `(${placeholders.join(', ')})`;
      })
      .join(', ');

    return {
      sql: `INSERT INTO ${table} (${colsSql}) VALUES ${rowsSql}`,
      bindings: b.all(),
    };
  }

  compileInsertGetId(builder: QueryBuilder, values: Record<string, unknown>): CompiledQuery {
    // MySQL uses LAST_INSERT_ID() — the adapter reads it from insertId on the result
    return this.compileInsert(builder, [values]);
  }

  compileInsertOrIgnore(builder: QueryBuilder, values: Record<string, unknown>[]): CompiledQuery {
    const compiled = this.compileInsert(builder, values);
    return {
      sql: compiled.sql.replace(/^INSERT INTO/, 'INSERT IGNORE INTO'),
      bindings: compiled.bindings,
    };
  }

  // ── UPSERT ────────────────────────────────────────────────────────────────

  compileUpsert(
    builder: QueryBuilder,
    values: Record<string, unknown>[],
    _uniqueBy: string[],
    updateColumns: string[]
  ): CompiledQuery {
    const compiled = this.compileInsert(builder, values);
    const b = new BindingCollector();
    b.addMany(compiled.bindings);

    // Duplicate the update-column bindings (they reference the same row values)
    const firstRow = values[0];
    const updateSql = updateColumns
      .map((c) => {
        const val = firstRow[c];
        const rhs = val instanceof Expression ? val.getValue() : b.add(val);
        return `${this.wrap(c)} = ${rhs}`;
      })
      .join(', ');

    return {
      sql: `${compiled.sql} ON DUPLICATE KEY UPDATE ${updateSql}`,
      bindings: b.all(),
    };
  }

  // ── UPDATE ────────────────────────────────────────────────────────────────

  compileUpdate(builder: QueryBuilder, values: Record<string, unknown>): CompiledQuery {
    const b = new BindingCollector();
    const table = this.wrap(builder.fromTable as string);

    const setSql = Object.entries(values)
      .map(([col, val]) => {
        const rhs = val instanceof Expression ? val.getValue() : b.add(val);
        return `${this.wrap(col)} = ${rhs}`;
      })
      .join(', ');

    let sql = `UPDATE ${table} SET ${setSql}`;

    if (builder.joins.length) sql += ` ${this.compileJoins(builder.joins, b)}`;
    if (builder.wheres.length) sql += ` WHERE ${this.compileWheres(builder.wheres, b)}`;

    return { sql, bindings: b.all() };
  }

  // ── DELETE ────────────────────────────────────────────────────────────────

  compileDelete(builder: QueryBuilder): CompiledQuery {
    const b = new BindingCollector();
    const table = this.wrap(builder.fromTable as string);

    let sql = `DELETE FROM ${table}`;
    if (builder.wheres.length) sql += ` WHERE ${this.compileWheres(builder.wheres, b)}`;

    return { sql, bindings: b.all() };
  }

  compileTruncate(table: string): CompiledQuery {
    return { sql: `TRUNCATE TABLE ${this.wrap(table)}`, bindings: [] };
  }

  // ── AGGREGATE ─────────────────────────────────────────────────────────────

  compileAggregate(builder: QueryBuilder, fn: string, column: string): CompiledQuery {
    const agg = fn.toUpperCase();
    const col = column === '*' ? '*' : this.wrap(column);
    const distinct = builder.isDistinct && column !== '*' ? 'DISTINCT ' : '';

    const clone = builder.clone();
    clone.aggregate = { fn, column } as AggregateState;
    clone.columns = [`${agg}(${distinct}${col}) AS \`aggregate\``];
    clone.orders = [];
    clone.limitValue = null;
    clone.offsetValue = null;

    return this.compileSelect(clone);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private compileColumns(builder: QueryBuilder): string {
    const distinct = builder.isDistinct ? 'SELECT DISTINCT' : 'SELECT';

    if (!builder.columns.length) return `${distinct} *`;

    const cols = builder.columns.map((col) => {
      if (typeof col === 'string') return this.wrapAlias(col);
      if (col instanceof Expression) return col.getValue();
      return String(col);
    });

    return `${distinct} ${cols.join(', ')}`;
  }

  private compileFrom(builder: QueryBuilder): string {
    if (!builder.fromTable) throw new Error('[orion] QueryBuilder: no table specified.');
    if (builder.fromTable instanceof Expression) return builder.fromTable.getValue();
    return this.wrapAlias(builder.fromTable);
  }

  private compileJoins(joins: JoinClause[], b: BindingCollector): string {
    return joins
      .map((join) => {
        const conditions = join.conditions
          .map((cond, i) => {
            const prefix = i === 0 ? 'ON' : cond.boolean;
            if (cond.type === 'raw') {
              b.addMany(cond.bindings ?? []);
              return `${prefix} ${cond.sql}`;
            }
            return `${prefix} ${this.wrap(cond.first)} ${cond.operator} ${this.wrap(cond.second)}`;
          })
          .join(' ');

        return `${join.type} JOIN ${this.wrapAlias(join.table)} ${conditions}`;
      })
      .join(' ');
  }

  compileWheres(wheres: WhereClause[], b: BindingCollector): string {
    return wheres
      .map((w, i) => {
        const prefix = i === 0 ? '' : `${w.boolean} `;
        return prefix + this.compileWhere(w, b);
      })
      .join(' ');
  }

  private compileWhere(w: WhereClause, b: BindingCollector): string {
    switch (w.type) {
      case 'basic': {
        const val = w.value instanceof Expression ? w.value.getValue() : b.add(w.value);
        return `${this.wrap(w.column!)} ${w.operator} ${val}`;
      }

      case 'in': {
        if (!w.values || w.values.length === 0) return '1 = 0';
        const placeholders = w.values.map((v) =>
          v instanceof Expression ? v.getValue() : b.add(v)
        );
        return `${this.wrap(w.column!)} IN (${placeholders.join(', ')})`;
      }

      case 'notIn': {
        if (!w.values || w.values.length === 0) return '1 = 1';
        const placeholders = w.values.map((v) =>
          v instanceof Expression ? v.getValue() : b.add(v)
        );
        return `${this.wrap(w.column!)} NOT IN (${placeholders.join(', ')})`;
      }

      case 'null':
        return `${this.wrap(w.column!)} IS NULL`;

      case 'notNull':
        return `${this.wrap(w.column!)} IS NOT NULL`;

      case 'between': {
        const [min, max] = w.values as [unknown, unknown];
        return `${this.wrap(w.column!)} BETWEEN ${b.add(min)} AND ${b.add(max)}`;
      }

      case 'notBetween': {
        const [min, max] = w.values as [unknown, unknown];
        return `${this.wrap(w.column!)} NOT BETWEEN ${b.add(min)} AND ${b.add(max)}`;
      }

      case 'column':
        return `${this.wrap(w.column!)} ${w.operator} ${this.wrap(w.value as string)}`;

      case 'nested': {
        const inner = this.compileWheres(w.nested!, b);
        return `(${inner})`;
      }

      case 'raw':
        b.addMany(w.rawBindings ?? []);
        return w.rawSql!;

      case 'exists': {
        const compiled = this.compileSelect(w.subQuery!);
        b.addMany(compiled.bindings);
        return `EXISTS (${compiled.sql})`;
      }

      case 'notExists': {
        const compiled = this.compileSelect(w.subQuery!);
        b.addMany(compiled.bindings);
        return `NOT EXISTS (${compiled.sql})`;
      }

      case 'inSubQuery': {
        const compiled = this.compileSelect(w.subQuery!);
        b.addMany(compiled.bindings);
        return `${this.wrap(w.column!)} IN (${compiled.sql})`;
      }

      case 'notInSubQuery': {
        const compiled = this.compileSelect(w.subQuery!);
        b.addMany(compiled.bindings);
        return `${this.wrap(w.column!)} NOT IN (${compiled.sql})`;
      }

      default:
        throw new Error(`[orion] Unknown where type: "${(w as WhereClause).type}"`);
    }
  }

  private compileGroups(groups: string[]): string {
    return groups.map((g) => this.wrap(g)).join(', ');
  }

  private compileHavings(havings: HavingClause[], b: BindingCollector): string {
    return havings
      .map((h, i) => {
        const prefix = i === 0 ? '' : `${h.boolean} `;
        if (h.type === 'raw') {
          b.addMany(h.rawBindings ?? []);
          return prefix + h.rawSql!;
        }
        const val = b.add(h.value);
        return `${prefix}${this.wrap(h.column!)} ${h.operator} ${val}`;
      })
      .join(' ');
  }

  private compileOrders(orders: OrderClause[], b: BindingCollector): string {
    return orders
      .map((o) => {
        if (o.type === 'raw') {
          b.addMany(o.rawBindings ?? []);
          return o.rawSql!;
        }
        return `${this.wrap(o.column!)} ${o.direction!.toUpperCase()}`;
      })
      .join(', ');
  }

  // ── Identifier quoting (backticks) ────────────────────────────────────────

  wrap(value: string | Expression): string {
    if (value instanceof Expression) return value.getValue();
    if (value === '*') return '*';
    if (value.includes('(')) return value;
    if (value.includes('.')) {
      return value
        .split('.')
        .map((p) => this.wrapSegment(p))
        .join('.');
    }
    return this.wrapSegment(value);
  }

  private wrapAlias(value: string): string {
    const asIndex = value.toLowerCase().lastIndexOf(' as ');
    if (asIndex !== -1) {
      const col = value.slice(0, asIndex).trim();
      const alias = value.slice(asIndex + 4).trim();
      return `${this.wrap(col)} AS ${this.wrapSegment(alias)}`;
    }
    return this.wrap(value);
  }

  private wrapSegment(value: string): string {
    if (value === '*' || value.startsWith('`')) return value;
    return `\`${value.replace(/`/g, '``')}\``;
  }

  columnize(columns: string[]): string {
    return columns.map((c) => this.wrap(c)).join(', ');
  }
}

// ── Internal binding collector (? style) ──────────────────────────────────────

class BindingCollector {
  private bindings: unknown[] = [];

  add(value: unknown): string {
    this.bindings.push(value);
    return '?';
  }

  addMany(values: unknown[]): void {
    values.forEach((v) => this.add(v));
  }

  all(): unknown[] {
    return this.bindings;
  }
}
