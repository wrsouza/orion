import { Expression } from '../Expression';
import { QueryBuilder } from '../QueryBuilder';

/** A compiled SQL statement ready to be sent to the database. */
export interface CompiledQuery {
  sql: string;
  bindings: unknown[];
}

/**
 * Contract every dialect-specific query grammar must satisfy.
 * Each method receives the current `QueryBuilder` state and returns
 * a fully parameterised SQL string with its bindings array.
 */
export interface QueryGrammar {
  compileSelect(builder: QueryBuilder): CompiledQuery;
  compileInsert(builder: QueryBuilder, values: Record<string, unknown>[]): CompiledQuery;
  compileInsertGetId(builder: QueryBuilder, values: Record<string, unknown>): CompiledQuery;
  compileInsertOrIgnore(builder: QueryBuilder, values: Record<string, unknown>[]): CompiledQuery;
  compileUpdate(builder: QueryBuilder, values: Record<string, unknown>): CompiledQuery;
  compileUpsert(
    builder: QueryBuilder,
    values: Record<string, unknown>[],
    uniqueBy: string[],
    updateColumns: string[]
  ): CompiledQuery;
  compileDelete(builder: QueryBuilder): CompiledQuery;
  compileTruncate(table: string): CompiledQuery;
  compileAggregate(builder: QueryBuilder, fn: string, column: string): CompiledQuery;
  columnize(columns: string[]): string;
  wrap(value: string | Expression): string;
}
