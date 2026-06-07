import Database, { Database as DatabaseType } from 'better-sqlite3';
import { Connection, QueryResult } from '../Connection';
import { SQLiteQueryGrammar } from '../../query/grammars/SQLiteQueryGrammar';
import type { QueryGrammar } from '../../query/grammars/QueryGrammar';

export interface SQLiteConfig {
  /** Path to the database file, or `':memory:'` for an in-memory database. */
  filename: string;
  /** better-sqlite3 open options (readonly, fileMustExist, timeout, etc.) */
  options?: Database.Options;
}

/**
 * SQLite adapter for orion using better-sqlite3 (synchronous API wrapped as async).
 *
 * Nested transactions are implemented via SAVEPOINTs, matching the Postgres/MySQL strategy.
 */
export class SQLiteAdapter implements Connection {
  private db: DatabaseType;

  constructor(config: SQLiteConfig) {
    this.db = new Database(config.filename, config.options);
    // Enable WAL mode for better concurrent read performance
    this.db.pragma('journal_mode = WAL');
    // Enforce FK constraints (SQLite has them off by default)
    this.db.pragma('foreign_keys = ON');
  }

  async query(sql: string, bindings: unknown[] = []): Promise<QueryResult> {
    const stmt = this.db.prepare(sql);
    const trimmed = sql.trimStart().toUpperCase();
    // SQLite only accepts numbers, strings, bigints, buffers, null — coerce Date to ISO string
    const bound = bindings.map((v) => (v instanceof Date ? v.toISOString() : v));

    if (
      trimmed.startsWith('SELECT') ||
      trimmed.startsWith('WITH') ||
      trimmed.startsWith('PRAGMA')
    ) {
      const rows = stmt.all(...bound) as Record<string, unknown>[];
      const fields = rows.length > 0 ? Object.keys(rows[0]).map((name) => ({ name })) : [];
      return { rows, rowCount: rows.length, fields };
    }

    // INSERT / UPDATE / DELETE / DDL
    const info = stmt.run(...bound);
    return {
      rows: [],
      rowCount: info.changes,
      fields: [],
      // Expose last insert rowid for insertGetId support
      lastInsertRowid: info.lastInsertRowid as number,
    };
  }

  async transaction<T>(callback: (conn: Connection) => Promise<T>): Promise<T> {
    const txConn = new SQLiteTransactionAdapter(this.db);
    this.db.exec('BEGIN');
    try {
      const result = await callback(txConn);
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this.db.close();
  }

  isConnected(): boolean {
    return this.db.open;
  }

  getGrammar(): QueryGrammar {
    return new SQLiteQueryGrammar();
  }

  /** Direct access to the underlying better-sqlite3 instance. */
  getDatabase(): DatabaseType {
    return this.db;
  }
}

class SQLiteTransactionAdapter implements Connection {
  private _savepointIndex = 0;

  constructor(private db: DatabaseType) {}

  async query(sql: string, bindings: unknown[] = []): Promise<QueryResult> {
    const stmt = this.db.prepare(sql);
    const trimmed = sql.trimStart().toUpperCase();
    const bound = bindings.map((v) => (v instanceof Date ? v.toISOString() : v));

    if (
      trimmed.startsWith('SELECT') ||
      trimmed.startsWith('WITH') ||
      trimmed.startsWith('PRAGMA')
    ) {
      const rows = stmt.all(...bound) as Record<string, unknown>[];
      const fields = rows.length > 0 ? Object.keys(rows[0]).map((name) => ({ name })) : [];
      return { rows, rowCount: rows.length, fields };
    }

    const info = stmt.run(...bound);
    return {
      rows: [],
      rowCount: info.changes,
      fields: [],
      lastInsertRowid: info.lastInsertRowid as number,
    };
  }

  async transaction<T>(callback: (conn: Connection) => Promise<T>): Promise<T> {
    const sp = `orion_sp_${++this._savepointIndex}`;
    this.db.exec(`SAVEPOINT ${sp}`);
    try {
      const result = await callback(this);
      this.db.exec(`RELEASE SAVEPOINT ${sp}`);
      return result;
    } catch (err) {
      this.db.exec(`ROLLBACK TO SAVEPOINT ${sp}`);
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    // released by parent adapter
  }

  isConnected(): boolean {
    return this.db.open;
  }

  getGrammar(): QueryGrammar {
    return new SQLiteQueryGrammar();
  }
}
