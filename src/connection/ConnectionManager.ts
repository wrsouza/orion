import { Connection } from './Connection';
import { PostgresAdapter, PostgresConfig } from './adapters/PostgresAdapter';
import { MySQLAdapter, MySQLConfig } from './adapters/MySQLAdapter';
import { SQLiteAdapter } from './adapters/SQLiteAdapter';
import { MariaDBAdapter, MariaDBConfig } from './adapters/MariaDBAdapter';
import { SQLServerAdapter, SQLServerConfig } from './adapters/SQLServerAdapter';

export type DriverName = 'postgres' | 'mysql' | 'mariadb' | 'sqlite' | 'sqlserver';

export interface ConnectionConfig {
  driver: DriverName;
  /** Postgres / MySQL: hostname. SQLite: omit. */
  host?: string;
  port?: number;
  /** Postgres / MySQL: database name. SQLite: omit (use `filename`). */
  database?: string;
  /** Postgres / MySQL: username. SQLite: omit. */
  user?: string;
  /** Postgres / MySQL: password. SQLite: omit. */
  password?: string;
  ssl?: boolean | object;
  pool?: {
    max?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
  };
  /** SQLite only: path to the .sqlite file, or `':memory:'`. */
  filename?: string;
  /** SQLite only: open options passed to better-sqlite3. */
  sqliteOptions?: import('./adapters/SQLiteAdapter').SQLiteConfig['options'];
}

/** URL scheme → driver name map. */
const URL_DRIVER_MAP: Record<string, DriverName> = {
  postgres: 'postgres',
  postgresql: 'postgres',
  mysql: 'mysql',
  mariadb: 'mariadb',
  sqlite: 'sqlite',
  sqlserver: 'sqlserver',
  mssql: 'sqlserver',
};

/**
 * Parse a database URL into a `ConnectionConfig`.
 *
 * Supported formats:
 * ```
 * postgres://user:pass@host:5432/mydb?ssl=true
 * postgresql://user:pass@host:5432/mydb
 * mysql://user:pass@host:3306/mydb
 * mariadb://user:pass@host:3306/mydb
 * sqlserver://user:pass@host:1433/mydb
 * mssql://user:pass@host:1433/mydb
 * sqlite:///path/to/db.sqlite
 * sqlite://:memory:
 * ```
 *
 * @example
 * ```ts
 * const config = parseConnectionUrl(process.env.DATABASE_URL!);
 * ConnectionManager.addConnection('default', config);
 * ```
 */
export function parseConnectionUrl(url: string): ConnectionConfig {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`[orion] Invalid connection URL: "${url}"`);
  }

  const scheme = parsed.protocol.replace(/:$/, '').toLowerCase();
  const driver = URL_DRIVER_MAP[scheme];

  if (!driver) {
    throw new Error(
      `[orion] Unsupported URL scheme "${scheme}". ` +
        `Supported: ${Object.keys(URL_DRIVER_MAP).join(', ')}`
    );
  }

  // SQLite: sqlite:///path/to/file.sqlite  or  sqlite://:memory:
  if (driver === 'sqlite') {
    const raw = url.slice(url.indexOf(':') + 1).replace(/^\/\//, '');
    const filename = raw === ':memory:' ? ':memory:' : parsed.pathname || raw;
    return { driver: 'sqlite', filename };
  }

  const config: ConnectionConfig = {
    driver,
    host: parsed.hostname || 'localhost',
    port: parsed.port ? parseInt(parsed.port, 10) : undefined,
    database: parsed.pathname.replace(/^\//, '') || undefined,
    user: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
  };

  // ?ssl=true / ?ssl=false
  const sslParam = parsed.searchParams.get('ssl');
  if (sslParam !== null) {
    config.ssl = sslParam !== 'false';
  }

  // ?pool_max=10
  const poolMax = parsed.searchParams.get('pool_max') ?? parsed.searchParams.get('max');
  if (poolMax !== null) {
    config.pool = { ...config.pool, max: parseInt(poolMax, 10) };
  }

  return config;
}

/**
 * Registry for named database connections.
 *
 * @example
 * ```ts
 * ConnectionManager.addConnection('default', {
 *   driver: 'postgres',
 *   host: 'localhost',
 *   database: 'myapp',
 *   user: 'postgres',
 *   password: 'secret',
 * });
 *
 * const db = ConnectionManager.getConnection();
 * const result = await db.query('SELECT 1');
 * ```
 */
export class ConnectionManager {
  private static connections = new Map<string, Connection>();
  private static defaultConnectionName = 'default';

  static addConnection(name: string, config: ConnectionConfig): void {
    if (this.connections.has(name)) {
      return;
    }
    this.connections.set(name, this.createAdapter(config));
  }

  /**
   * Register a named connection from a database URL string.
   * The driver is inferred from the URL scheme.
   *
   * @example
   * ```ts
   * ConnectionManager.addConnectionUrl('default', process.env.DATABASE_URL!);
   * // postgres://user:pass@host:5432/mydb
   * // mysql://user:pass@host:3306/mydb
   * // sqlite:///path/to/app.db
   * ```
   */
  static addConnectionUrl(name: string, url: string): void {
    this.addConnection(name, parseConnectionUrl(url));
  }

  static getConnection(name?: string): Connection {
    const key = name ?? this.defaultConnectionName;
    const conn = this.connections.get(key);
    if (!conn) {
      throw new Error(
        `[orion] Connection "${key}" not found. Call ConnectionManager.addConnection() first.`
      );
    }
    return conn;
  }

  static setDefaultConnection(name: string): void {
    if (!this.connections.has(name)) {
      throw new Error(`[orion] Cannot set default: connection "${name}" does not exist.`);
    }
    this.defaultConnectionName = name;
  }

  static getDefaultConnectionName(): string {
    return this.defaultConnectionName;
  }

  static async disconnectAll(): Promise<void> {
    const promises = Array.from(this.connections.values()).map((c) => c.disconnect());
    await Promise.all(promises);
    this.connections.clear();
  }

  private static createAdapter(config: ConnectionConfig): Connection {
    if (config.driver === 'postgres') {
      const pgConfig: PostgresConfig = {
        host: config.host!,
        port: config.port ?? 5432,
        database: config.database!,
        user: config.user!,
        password: config.password!,
        ssl: config.ssl,
        max: config.pool?.max,
        idleTimeoutMillis: config.pool?.idleTimeoutMillis,
        connectionTimeoutMillis: config.pool?.connectionTimeoutMillis,
      };
      return new PostgresAdapter(pgConfig);
    }

    if (config.driver === 'mysql') {
      const mysqlConfig: MySQLConfig = {
        host: config.host!,
        port: config.port ?? 3306,
        database: config.database!,
        user: config.user!,
        password: config.password!,
        ssl: config.ssl as object | undefined,
        connectionLimit: config.pool?.max,
        connectTimeout: config.pool?.connectionTimeoutMillis,
      };
      return new MySQLAdapter(mysqlConfig);
    }

    if (config.driver === 'mariadb') {
      const mariaConfig: MariaDBConfig = {
        host: config.host!,
        port: config.port ?? 3306,
        database: config.database!,
        user: config.user!,
        password: config.password!,
        ssl: config.ssl as object | undefined,
        connectionLimit: config.pool?.max,
        connectTimeout: config.pool?.connectionTimeoutMillis,
      };
      return new MariaDBAdapter(mariaConfig);
    }

    if (config.driver === 'sqlserver') {
      const ssConfig: SQLServerConfig = {
        host: config.host!,
        port: config.port ?? 1433,
        database: config.database!,
        user: config.user!,
        password: config.password!,
        options: {
          encrypt: config.ssl !== undefined ? Boolean(config.ssl) : false,
          trustServerCertificate: true,
        },
        pool: {
          max: config.pool?.max,
          idleTimeoutMillis: config.pool?.idleTimeoutMillis,
        },
      };
      return new SQLServerAdapter(ssConfig);
    }

    if (config.driver === 'sqlite') {
      if (!config.filename) {
        throw new Error(`[orion] SQLite connections require a "filename" in the config.`);
      }
      return new SQLiteAdapter({ filename: config.filename, options: config.sqliteOptions });
    }

    throw new Error(`[orion] Unsupported driver: "${config.driver}".`);
  }
}
