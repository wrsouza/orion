import { Pool, PoolClient, PoolConfig } from 'pg';
import { Connection, QueryResult } from '../Connection';
import { PostgresQueryGrammar } from '../../query/grammars/PostgresQueryGrammar';
import type { QueryGrammar } from '../../query/grammars/QueryGrammar';

export interface PostgresConfig extends PoolConfig {
  host: string;
  port?: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean | object;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

export class PostgresAdapter implements Connection {
  private pool: Pool;
  private connected = false;

  constructor(config: PostgresConfig) {
    this.pool = new Pool(config);

    this.pool.on('connect', () => {
      this.connected = true;
    });

    this.pool.on('error', (err) => {
      console.error('[orion] Unexpected postgres pool error:', err.message);
    });
  }

  async query(sql: string, bindings: unknown[] = []): Promise<QueryResult> {
    const result = await this.pool.query(sql, bindings);
    this.connected = true;
    return {
      rows: result.rows as Record<string, unknown>[],
      rowCount: result.rowCount ?? 0,
      fields: result.fields.map((f) => ({ name: f.name })),
    };
  }

  async transaction<T>(callback: (conn: Connection) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const transactionConn = new PostgresTransactionAdapter(client);

    try {
      await client.query('BEGIN');
      const result = await callback(transactionConn);
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

  getGrammar(): QueryGrammar {
    return new PostgresQueryGrammar();
  }
}

class PostgresTransactionAdapter implements Connection {
  constructor(private client: PoolClient) {}

  async query(sql: string, bindings: unknown[] = []): Promise<QueryResult> {
    const result = await this.client.query(sql, bindings);
    return {
      rows: result.rows as Record<string, unknown>[],
      rowCount: result.rowCount ?? 0,
      fields: result.fields.map((f) => ({ name: f.name })),
    };
  }

  async transaction<T>(callback: (conn: Connection) => Promise<T>): Promise<T> {
    await this.client.query('SAVEPOINT orion_sp');
    try {
      const result = await callback(this);
      await this.client.query('RELEASE SAVEPOINT orion_sp');
      return result;
    } catch (err) {
      await this.client.query('ROLLBACK TO SAVEPOINT orion_sp');
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    // transaction clients are released by the parent adapter
  }

  isConnected(): boolean {
    return true;
  }

  getGrammar(): QueryGrammar {
    return new PostgresQueryGrammar();
  }
}
