export class QueryException extends Error {
  readonly sql: string;
  readonly bindings: unknown[];
  readonly cause: Error;

  constructor(sql: string, bindings: unknown[], cause: Error) {
    super(`[orion] Query failed: ${cause.message}`);
    this.name = 'QueryException';
    this.sql = sql;
    this.bindings = bindings;
    this.cause = cause;
  }
}
