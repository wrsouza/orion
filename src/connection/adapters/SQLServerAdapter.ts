import * as mssql from 'mssql';
import { Connection, QueryResult } from '../Connection';
import { SQLServerQueryGrammar } from '../../query/grammars/SQLServerQueryGrammar';
import type { QueryGrammar } from '../../query/grammars/QueryGrammar';

export interface SQLServerConfig {
  host: string;
  port?: number;
  database: string;
  user: string;
  password: string;
  /** TLS options — set `encrypt: true` for Azure SQL */
  options?: {
    encrypt?: boolean;
    trustServerCertificate?: boolean;
    enableArithAbort?: boolean;
    [key: string]: unknown;
  };
  pool?: {
    max?: number;
    min?: number;
    idleTimeoutMillis?: number;
  };
}

export class SQLServerAdapter implements Connection {
  private pool: mssql.ConnectionPool;
  private connected = false;

  constructor(config: SQLServerConfig) {
    this.pool = new mssql.ConnectionPool({
      server: config.host,
      port: config.port ?? 1433,
      database: config.database,
      user: config.user,
      password: config.password,
      options: {
        encrypt: config.options?.encrypt ?? false,
        trustServerCertificate: config.options?.trustServerCertificate ?? true,
        enableArithAbort: config.options?.enableArithAbort ?? true,
        ...config.options,
      },
      pool: {
        max: config.pool?.max ?? 10,
        min: config.pool?.min ?? 0,
        idleTimeoutMillis: config.pool?.idleTimeoutMillis ?? 30000,
      },
    });
  }

  /** Lazily connect the pool on first use. */
  private async getPool(): Promise<mssql.ConnectionPool> {
    if (!this.pool.connected && !this.pool.connecting) {
      await this.pool.connect();
    }
    return this.pool;
  }

  async query(sql: string, bindings: unknown[] = []): Promise<QueryResult> {
    const pool = await this.getPool();
    const request = pool.request();

    // mssql uses named parameters — @p1, @p2, …
    bindings.forEach((val, i) => {
      request.input(`p${i + 1}`, val);
    });

    const result = await request.query(sql);
    this.connected = true;

    // For INSERT … OUTPUT … we get rows back
    const rows = (result.recordset ?? []) as Record<string, unknown>[];
    const affected = result.rowsAffected?.[0] ?? rows.length;

    const fields = rows.length > 0 ? Object.keys(rows[0]).map((name) => ({ name })) : [];

    return {
      rows,
      rowCount: affected,
      fields,
      lastInsertRowid: rows[0]?.id !== undefined ? Number(rows[0].id) : undefined,
    };
  }

  async transaction<T>(callback: (conn: Connection) => Promise<T>): Promise<T> {
    const pool = await this.getPool();
    const tx = new mssql.Transaction(pool);
    await tx.begin();

    const txConn = new SQLServerTransactionAdapter(tx);

    try {
      const result = await callback(txConn);
      await tx.commit();
      return result;
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    await this.pool.close();
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getGrammar(): QueryGrammar {
    return new SQLServerQueryGrammar();
  }
}

class SQLServerTransactionAdapter implements Connection {
  private _savepointIndex = 0;

  constructor(private tx: mssql.Transaction) {}

  async query(sql: string, bindings: unknown[] = []): Promise<QueryResult> {
    const request = new mssql.Request(this.tx);

    bindings.forEach((val, i) => {
      request.input(`p${i + 1}`, val);
    });

    const result = await request.query(sql);

    const rows = (result.recordset ?? []) as Record<string, unknown>[];
    const affected = result.rowsAffected?.[0] ?? rows.length;
    const fields = rows.length > 0 ? Object.keys(rows[0]).map((name) => ({ name })) : [];

    return {
      rows,
      rowCount: affected,
      fields,
      lastInsertRowid: rows[0]?.id !== undefined ? Number(rows[0].id) : undefined,
    };
  }

  async transaction<T>(callback: (conn: Connection) => Promise<T>): Promise<T> {
    // SQL Server uses SAVE TRANSACTION (not SAVEPOINT)
    const sp = `orion_sp_${++this._savepointIndex}`;
    const request = new mssql.Request(this.tx);
    await request.query(`SAVE TRANSACTION ${sp}`);

    try {
      const result = await callback(this);
      // No RELEASE equivalent in SQL Server — just continue
      return result;
    } catch (err) {
      const rollbackReq = new mssql.Request(this.tx);
      await rollbackReq.query(`ROLLBACK TRANSACTION ${sp}`);
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    // managed by parent adapter
  }

  isConnected(): boolean {
    return true;
  }

  getGrammar(): QueryGrammar {
    return new SQLServerQueryGrammar();
  }
}
