import mariadb, { Pool, PoolConnection, PoolConfig } from 'mariadb';
import { Connection, QueryResult } from '../Connection';

export interface MariaDBConfig extends PoolConfig {
  host: string;
  port?: number;
  database: string;
  user: string;
  password: string;
  ssl?: object;
  connectionLimit?: number;
  connectTimeout?: number;
}

export class MariaDBAdapter implements Connection {
  private pool: Pool;
  private connected = false;

  constructor(config: MariaDBConfig) {
    this.pool = mariadb.createPool({
      ...config,
      // Return plain objects, not MariaDB row objects
      rowsAsArray: false,
      // Emit bigint as number (consistent with pg behaviour)
      bigIntAsNumber: true,
    });
  }

  async query(sql: string, bindings: unknown[] = []): Promise<QueryResult> {
    const rows = await this.pool.query(sql, bindings);
    this.connected = true;

    // INSERT/UPDATE/DELETE: mariadb returns a ResultSetHeader object, not an array
    if (!Array.isArray(rows)) {
      return {
        rows: [],
        rowCount: (rows as any).affectedRows ?? 0,
        fields: [],
        lastInsertRowid:
          (rows as any).insertId !== undefined ? Number((rows as any).insertId) : undefined,
      };
    }

    const rowArray = rows as Record<string, unknown>[];
    const fields = rowArray.length > 0 ? Object.keys(rowArray[0]).map((name) => ({ name })) : [];

    return {
      rows: rowArray,
      rowCount: rowArray.length,
      fields,
    };
  }

  async transaction<T>(callback: (conn: Connection) => Promise<T>): Promise<T> {
    const client = await this.pool.getConnection();
    const txConn = new MariaDBTransactionAdapter(client);

    try {
      await client.query('START TRANSACTION');
      const result = await callback(txConn);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      void client.release();
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

class MariaDBTransactionAdapter implements Connection {
  private _savepointIndex = 0;

  constructor(private client: PoolConnection) {}

  async query(sql: string, bindings: unknown[] = []): Promise<QueryResult> {
    const rows = await this.client.query(sql, bindings);

    if (!Array.isArray(rows)) {
      return {
        rows: [],
        rowCount: (rows as any).affectedRows ?? 0,
        fields: [],
        lastInsertRowid:
          (rows as any).insertId !== undefined ? Number((rows as any).insertId) : undefined,
      };
    }

    const rowArray = rows as Record<string, unknown>[];
    const fields = rowArray.length > 0 ? Object.keys(rowArray[0]).map((name) => ({ name })) : [];

    return { rows: rowArray, rowCount: rowArray.length, fields };
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
