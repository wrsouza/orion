import { createPool, Pool, PoolConnection, PoolOptions } from 'mysql2/promise';
import { Connection, QueryResult } from '../Connection';

export interface MySQLConfig extends PoolOptions {
  host: string;
  port?: number;
  database: string;
  user: string;
  password: string;
  ssl?: object;
  connectionLimit?: number;
  idleTimeout?: number;
  connectTimeout?: number;
}

export class MySQLAdapter implements Connection {
  private pool: Pool;
  private connected = false;

  constructor(config: MySQLConfig) {
    this.pool = createPool({
      ...config,
      // mysql2 returns arrays for rows by default; ensure objects
      rowsAsArray: false,
    });
  }

  async query(sql: string, bindings: unknown[] = []): Promise<QueryResult> {
    const [rows, fields] = await this.pool.query(sql, bindings);
    this.connected = true;

    const rowArray = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];

    return {
      rows: rowArray,
      rowCount: rowArray.length,
      fields: (fields ?? []).map((f: any) => ({ name: f.name as string })),
    };
  }

  async transaction<T>(callback: (conn: Connection) => Promise<T>): Promise<T> {
    const client = await this.pool.getConnection();
    const txConn = new MySQLTransactionAdapter(client);

    try {
      await client.query('START TRANSACTION');
      const result = await callback(txConn);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async disconnect(): Promise<void> {
    await this.pool.end();
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }
}

class MySQLTransactionAdapter implements Connection {
  private _savepointIndex = 0;

  constructor(private client: PoolConnection) {}

  async query(sql: string, bindings: unknown[] = []): Promise<QueryResult> {
    const [rows, fields] = await this.client.query(sql, bindings);
    const rowArray = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
    return {
      rows: rowArray,
      rowCount: rowArray.length,
      fields: (fields ?? []).map((f: any) => ({ name: f.name as string })),
    };
  }

  async transaction<T>(callback: (conn: Connection) => Promise<T>): Promise<T> {
    const sp = `orion_sp_${++this._savepointIndex}`;
    await this.client.query(`SAVEPOINT ${sp}`);
    try {
      const result = await callback(this);
      await this.client.query(`RELEASE SAVEPOINT ${sp}`);
      return result;
    } catch (err) {
      await this.client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    // released by parent adapter
  }

  isConnected(): boolean {
    return true;
  }
}
