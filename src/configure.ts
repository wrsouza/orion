import {
  ConnectionConfig,
  ConnectionManager,
  parseConnectionUrl,
} from './connection/ConnectionManager';
import { MorphMap } from './model/MorphMap';
import { Model } from './model/Model';

export interface OrionConfig {
  /**
   * Connection name. The first connection defaults to `'default'` when omitted.
   * Required for every subsequent connection in a multi-connection array.
   */
  name?: string;

  /**
   * Database connection — either a URL string or a full config object.
   *
   * @example
   * connection: process.env.DATABASE_URL
   * connection: { driver: 'postgres', host: 'localhost', database: 'myapp', user: 'pg', password: '' }
   */
  connection: string | ConnectionConfig;

  migrations?: {
    /** Path to the migrations directory. Default: `./database/migrations` */
    path?: string;
    /** Control table name. Default: `orion_migrations` */
    table?: string;
  };

  seeders?: {
    /** Path to the seeders directory. Default: `./database/seeders` */
    path?: string;
    /**
     * Entry-point seeder class name used by `db:seed` when no `--class` flag
     * is passed. Default: `DatabaseSeeder`
     */
    entry?: string;
  };

  /**
   * Polymorphic type aliases. Registered once at startup so morph columns
   * store short names instead of full class names.
   *
   * @example
   * morphs: { post: Post, video: Video }
   */
  morphs?: Record<string, Function>;

  /**
   * Throw when a relation is accessed without eager-loading.
   * Useful in development to catch N+1 bugs at runtime.
   *
   * @example
   * preventLazyLoading: process.env.NODE_ENV !== 'production'
   */
  preventLazyLoading?: boolean;
}

/**
 * Configure the Orion ORM — accepts a single connection config or an array
 * for multiple connections. The first entry (or the object itself) is always
 * the `default` connection used by all models unless overridden with `@table`.
 *
 * Place this in a single `src/database.ts` file and import it at your
 * application entry point. The CLI reads the same file automatically.
 *
 * @example — single connection
 * ```ts
 * export default createConnection({
 *   connection: process.env.DATABASE_URL,
 *   migrations: { path: './src/database/migrations' },
 * });
 * ```
 *
 * @example — multiple connections
 * ```ts
 * export default createConnection([
 *   {
 *     connection: process.env.DATABASE_URL,
 *     migrations: { path: './src/database/migrations' },
 *   },
 *   {
 *     name: 'analytics',
 *     connection: process.env.ANALYTICS_DATABASE_URL,
 *     migrations: { path: './src/database/analytics-migrations' },
 *   },
 * ]);
 * ```
 */
export function createConnection(config: OrionConfig | OrionConfig[]): OrionConfig | OrionConfig[] {
  const configs = Array.isArray(config) ? config : [config];

  for (let i = 0; i < configs.length; i++) {
    const cfg = configs[i];
    const name = cfg.name ?? (i === 0 ? 'default' : `connection_${i}`);

    const resolved: ConnectionConfig =
      typeof cfg.connection === 'string' ? parseConnectionUrl(cfg.connection) : cfg.connection;

    ConnectionManager.addConnection(name, resolved);

    if (cfg.morphs) {
      MorphMap.enforce(cfg.morphs);
    }

    if (cfg.preventLazyLoading) {
      Model.preventLazyLoading();
    }
  }

  return config;
}
