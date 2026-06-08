import {
  ConnectionConfig,
  ConnectionManager,
  parseConnectionUrl,
} from './connection/ConnectionManager';
import { MorphMap } from './model/MorphMap';
import { Model } from './model/Model';

export interface OrionConfig {
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
 * Configure the Orion ORM in one call — connection, migrations path, morph map
 * and lazy-loading guard are all set up here.
 *
 * Place this in a single `src/database.ts` file and import it at your
 * application entry point. The CLI reads the same file automatically.
 *
 * @example
 * ```ts
 * // src/database.ts
 * import { createConnection } from '@wrsouza/orion';
 * import { Post } from './models/Post';
 *
 * export default createConnection({
 *   connection: process.env.DATABASE_URL,
 *   migrations: { path: './src/database/migrations' },
 *   morphs: { post: Post },
 *   preventLazyLoading: process.env.NODE_ENV !== 'production',
 * });
 * ```
 *
 * In your app entry point (Express, NestJS, Next.js, etc.):
 * ```ts
 * import './database'; // one import — everything is configured
 * ```
 *
 * CLI (add to package.json scripts):
 * ```
 * "migrate": "node -r ts-node/register node_modules/@wrsouza/orion/dist/cli/index.js migrate"
 * ```
 */
export function createConnection(config: OrionConfig): OrionConfig {
  const resolved: ConnectionConfig =
    typeof config.connection === 'string'
      ? parseConnectionUrl(config.connection)
      : config.connection;

  ConnectionManager.addConnection('default', resolved);

  if (config.morphs) {
    MorphMap.enforce(config.morphs);
  }

  if (config.preventLazyLoading) {
    Model.preventLazyLoading();
  }

  return config;
}
