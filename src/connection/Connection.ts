/** Normalised result returned by every adapter after executing a query. */
export interface QueryResult {
  /** The rows returned by the database, each row as a plain object. */
  rows: Record<string, unknown>[];
  /** Number of rows affected or returned. */
  rowCount: number;
  /** Metadata for each column in the result set. */
  fields: { name: string }[];
  /** The rowid of the last inserted row (SQLite / MySQL). */
  lastInsertRowid?: number;
}

/**
 * Common contract that every database adapter must satisfy.
 * All ORM layers interact with the database exclusively through this interface,
 * making adapters fully interchangeable.
 */
export interface Connection {
  /**
   * Execute a parameterised SQL query.
   * @param sql - The SQL string, using `$1`, `$2` … placeholders.
   * @param bindings - Ordered array of values for the placeholders.
   */
  query(sql: string, bindings?: unknown[]): Promise<QueryResult>;

  /**
   * Execute `callback` inside a database transaction.
   * The transaction is committed if the callback resolves, rolled back if it throws.
   * Supports nested calls via savepoints (driver-dependent).
   */
  transaction<T>(callback: (conn: Connection) => Promise<T>): Promise<T>;

  /** Release all resources held by this connection / pool. */
  disconnect(): Promise<void>;

  /** Returns `true` if at least one successful query has been made. */
  isConnected(): boolean;

  /** Returns the query grammar appropriate for this driver. */
  getGrammar(): import('../query/grammars/QueryGrammar').QueryGrammar;
}
