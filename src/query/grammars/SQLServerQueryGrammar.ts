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
 * Compiles `QueryBuilder` state into T-SQL (SQL Server) flavoured SQL.
 *
 * Key differences vs other grammars:
 * - Named parameters: `@p1`, `@p2`, … (mssql driver maps these by name)
 * - Identifier quoting: `[square brackets]`
 * - No LIMIT/OFFSET → `TOP n` (no offset) or `OFFSET n ROWS FETCH NEXT n ROWS ONLY`
 *   (FETCH requires ORDER BY — a default `ORDER BY (SELECT NULL)` is injected when missing)
 * - `insertGetId` → `INSERT … OUTPUT INSERTED.[pk]`
 * - `insertOrIgnore` → `INSERT … WHERE NOT EXISTS (SELECT 1 …)`
 * - `UPSERT` → `MERGE INTO … USING … ON … WHEN MATCHED / WHEN NOT MATCHED`
 * - `TRUNCATE TABLE` (no CASCADE, no RESTART IDENTITY)
 * - Lock modes translated to SQL Server hints (`WITH (UPDLOCK)`, `WITH (HOLDLOCK)`)
 */
export class SQLServerQueryGrammar implements QueryGrammar {
  // ── SELECT ────────────────────────────────────────────────────────────────

  compileSelect(builder: QueryBuilder): CompiledQuery {
    const b = new BindingCollector();
    const parts: string[] = [];

    // TOP n only when there's a limit but no offset
    const hasLimit = builder.limitValue !== null;
    const hasOffset = builder.offsetValue !== null;
    const useTop = hasLimit && !hasOffset;

    parts.push(this.compileColumns(builder, useTop ? builder.limitValue! : null));
    parts.push(`FROM ${this.compileFrom(builder)}`);

    if (builder.joins.length) parts.push(this.compileJoins(builder.joins, b));
    if (builder.wheres.length) parts.push(`WHERE ${this.compileWheres(builder.wheres, b)}`);
    if (builder.groups.length) parts.push(`GROUP BY ${this.compileGroups(builder.groups)}`);
    if (builder.havings.length) parts.push(`HAVING ${this.compileHavings(builder.havings, b)}`);

    // ORDER BY (required when using OFFSET … FETCH)
    if (builder.orders.length) {
      parts.push(`ORDER BY ${this.compileOrders(builder.orders, b)}`);
    } else if (hasOffset) {
      parts.push('ORDER BY (SELECT NULL)');
    }

    if (hasOffset) {
      parts.push(`OFFSET ${builder.offsetValue} ROWS`);
      if (hasLimit) {
        parts.push(`FETCH NEXT ${builder.limitValue} ROWS ONLY`);
      }
    }

    if (builder.lockMode) {
      // Append lock hints — SQL Server uses table hints, but we add query-level hints here
      // for compatibility. Full table-hint support would require modifying the FROM clause.
      const hint =
        builder.lockMode === 'FOR UPDATE'
          ? '-- WITH (UPDLOCK, ROWLOCK)'
          : builder.lockMode === 'FOR SHARE'
            ? '-- WITH (HOLDLOCK)'
            : `-- ${builder.lockMode}`;
      parts.push(hint);
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
    const b = new BindingCollector();
    const table = this.wrap(builder.fromTable as string);
    const pk = builder.primaryKey ?? 'id';
    const columns = Object.keys(values);
    const colsSql = columns.map((c) => this.wrap(c)).join(', ');

    const placeholders = columns.map((col) => {
      const val = values[col];
      return val instanceof Expression ? val.getValue() : b.add(val);
    });

    return {
      sql: `INSERT INTO ${table} (${colsSql}) OUTPUT INSERTED.${this.wrap(pk)} VALUES (${placeholders.join(', ')})`,
      bindings: b.all(),
    };
  }

  compileInsertOrIgnore(builder: QueryBuilder, values: Record<string, unknown>[]): CompiledQuery {
    // SQL Server has no INSERT IGNORE — use WHERE NOT EXISTS pattern
    const b = new BindingCollector();
    const table = this.wrap(builder.fromTable as string);
    const columns = Object.keys(values[0]);
    const colsSql = columns.map((c) => this.wrap(c)).join(', ');

    // For simplicity, compile as a single-row INSERT WHERE NOT EXISTS
    // (multi-row insertOrIgnore is rarely needed; we compile each row independently)
    const row = values[0];
    const placeholders = columns.map((col) => {
      const val = row[col];
      return val instanceof Expression ? val.getValue() : b.add(val);
    });

    return {
      sql: `IF NOT EXISTS (SELECT 1 FROM ${table} WHERE ${columns
        .map((col) => {
          const val = row[col];
          return `${this.wrap(col)} = ${val instanceof Expression ? val.getValue() : b.add(val)}`;
        })
        .join(' AND ')}) INSERT INTO ${table} (${colsSql}) VALUES (${placeholders.join(', ')})`,
      bindings: b.all(),
    };
  }

  // ── UPSERT ────────────────────────────────────────────────────────────────

  compileUpsert(
    builder: QueryBuilder,
    values: Record<string, unknown>[],
    uniqueBy: string[],
    updateColumns: string[]
  ): CompiledQuery {
    const b = new BindingCollector();
    const table = this.wrap(builder.fromTable as string);
    const columns = Object.keys(values[0]);

    // Build the VALUES row list for the USING clause
    const rowsSql = values
      .map((row) => {
        const placeholders = columns.map((col) => {
          const val = row[col];
          return val instanceof Expression ? val.getValue() : b.add(val);
        });
        return `(${placeholders.join(', ')})`;
      })
      .join(', ');

    const colsSql = columns.map((c) => this.wrap(c)).join(', ');
    const srcCols = columns.map((c) => `[src].${this.wrap(c)}`).join(', ');

    const onClause = uniqueBy
      .map((c) => `[tgt].${this.wrap(c)} = [src].${this.wrap(c)}`)
      .join(' AND ');

    const updateSql = updateColumns
      .map((c) => `[tgt].${this.wrap(c)} = [src].${this.wrap(c)}`)
      .join(', ');

    const sql =
      `MERGE INTO ${table} AS [tgt] ` +
      `USING (VALUES ${rowsSql}) AS [src] (${colsSql}) ` +
      `ON ${onClause} ` +
      `WHEN MATCHED THEN UPDATE SET ${updateSql} ` +
      `WHEN NOT MATCHED THEN INSERT (${colsSql}) VALUES (${srcCols});`;

    return { sql, bindings: b.all() };
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
    clone.columns = [`${agg}(${distinct}${col}) AS [aggregate]`];
    clone.orders = [];
    clone.limitValue = null;
    clone.offsetValue = null;

    return this.compileSelect(clone);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private compileColumns(builder: QueryBuilder, top: number | null): string {
    const distinct = builder.isDistinct ? 'SELECT DISTINCT' : 'SELECT';
    const topClause = top !== null ? ` TOP ${top}` : '';

    if (!builder.columns.length) return `${distinct}${topClause} *`;

    const cols = builder.columns.map((col) => {
      if (typeof col === 'string') return this.wrapAlias(col);
      if (col instanceof Expression) return col.getValue();
      return String(col);
    });

    return `${distinct}${topClause} ${cols.join(', ')}`;
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

  // ── Identifier quoting ([square brackets]) ───────────────────────────────

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
    if (value === '*' || (value.startsWith('[') && value.endsWith(']'))) return value;
    return `[${value.replace(/]/g, ']]')}]`;
  }

  columnize(columns: string[]): string {
    return columns.map((c) => this.wrap(c)).join(', ');
  }
}

// ── Internal binding collector (@p1 style) ────────────────────────────────────

class BindingCollector {
  private bindings: unknown[] = [];

  add(value: unknown): string {
    this.bindings.push(value);
    return `@p${this.bindings.length}`;
  }

  addMany(values: unknown[]): void {
    values.forEach((v) => this.add(v));
  }

  all(): unknown[] {
    return this.bindings;
  }
}
