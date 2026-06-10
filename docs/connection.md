# Connection

- [Overview](#overview)
- [createConnection()](#createconnection)
  - [Connection via URL](#connection-via-url)
  - [Connection via Config Object](#connection-via-config-object)
  - [Morph Map](#morph-map)
  - [Lazy Loading Guard](#lazy-loading-guard)
- [Multiple Connections](#multiple-connections)
  - [Per-connection fields](#orionconfig--per-connection-fields)
  - [Pointing a model at a specific connection](#pointing-a-model-at-a-specific-connection)
  - [Running migrations on multiple connections](#running-migrations-on-multiple-connections)
- [Config File Auto-detection](#config-file-auto-detection)
  - [Custom Config Path](#custom-config-path)
- [URL Reference](#url-reference)

---

## Overview

Orion uses a single `src/database.ts` file as the central configuration point for your entire application. Importing this file bootstraps the database connection, registers polymorphic type aliases, and configures runtime behaviours — regardless of which framework you use.

```ts
// src/database.ts
import { createConnection } from '@wrsouza/orion';

export default createConnection({
  connection: process.env.DATABASE_URL,
  migrations: { path: './src/database/migrations' },
});
```

Then in your app entry point — one import, everything is configured:

```ts
import './database';
```

The same file is auto-detected by the Orion CLI for running migrations, so you never need a separate config file.

For framework-specific setup guides, see the **Integrations** section: [Express](./integrations/express), [Fastify](./integrations/fastify), [NestJS](./integrations/nestjs), [Next.js](./integrations/nextjs), [React Router v7](./integrations/react-router).

---

## createConnection()

```ts
import { createConnection } from '@wrsouza/orion';

// Single connection
createConnection(config: OrionConfig): OrionConfig

// Multiple connections
createConnection(config: OrionConfig[]): OrionConfig[]
```

### OrionConfig

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | — | Connection name. Defaults to `'default'` for the first entry |
| `connection` | `string \| ConnectionConfig` | ✅ | Database URL or config object |
| `migrations.path` | `string` | — | Path to migrations directory. Default: `./database/migrations` |
| `migrations.table` | `string` | — | Control table name. Default: `orion_migrations` |
| `morphs` | `Record<string, Function>` | — | Polymorphic type alias map |
| `preventLazyLoading` | `boolean` | — | Throw on un-eager-loaded relation access |

### Connection via URL

The simplest setup — the driver is inferred from the URL scheme:

```ts
// src/database.ts
import { createConnection } from '@wrsouza/orion';

export default createConnection({
  connection: process.env.DATABASE_URL,
  migrations: { path: './src/database/migrations' },
});
```

Supported URL schemes:

| Scheme | Driver |
|---|---|
| `postgres://` or `postgresql://` | PostgreSQL |
| `mysql://` | MySQL |
| `mariadb://` | MariaDB |
| `sqlserver://` or `mssql://` | SQL Server |
| `sqlite:///path/to/file.db` | SQLite (file) |
| `sqlite://:memory:` | SQLite (in-memory) |

### Connection via Config Object

Use a config object when you need fine-grained control over pool settings, SSL, or other driver options:

::: code-group

```ts [PostgreSQL]
import { createConnection } from '@wrsouza/orion';

export default createConnection({
  connection: {
    driver:   'postgres',
    host:     process.env.DB_HOST ?? 'localhost',
    port:     Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME ?? 'myapp',
    user:     process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASS ?? '',
    ssl:      process.env.DB_SSL === 'true',
    pool: {
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    },
  },
  migrations: { path: './src/database/migrations' },
});
```

```ts [MySQL]
import { createConnection } from '@wrsouza/orion';

export default createConnection({
  connection: {
    driver:   'mysql',
    host:     process.env.DB_HOST ?? 'localhost',
    port:     Number(process.env.DB_PORT ?? 3306),
    database: process.env.DB_NAME ?? 'myapp',
    user:     process.env.DB_USER ?? 'root',
    password: process.env.DB_PASS ?? '',
    pool: { max: 10 },
  },
  migrations: { path: './src/database/migrations' },
});
```

```ts [MariaDB]
import { createConnection } from '@wrsouza/orion';

export default createConnection({
  connection: {
    driver:   'mariadb',
    host:     process.env.DB_HOST ?? 'localhost',
    port:     Number(process.env.DB_PORT ?? 3306),
    database: process.env.DB_NAME ?? 'myapp',
    user:     process.env.DB_USER ?? 'root',
    password: process.env.DB_PASS ?? '',
    pool: { max: 10 },
  },
  migrations: { path: './src/database/migrations' },
});
```

```ts [SQL Server]
import { createConnection } from '@wrsouza/orion';

export default createConnection({
  connection: {
    driver:   'sqlserver',
    host:     process.env.DB_HOST ?? 'localhost',
    port:     Number(process.env.DB_PORT ?? 1433),
    database: process.env.DB_NAME ?? 'myapp',
    user:     process.env.DB_USER ?? 'sa',
    password: process.env.DB_PASS ?? '',
    ssl:      false,
    pool: { max: 10 },
  },
  migrations: { path: './src/database/migrations' },
});
```

```ts [SQLite]
import { createConnection } from '@wrsouza/orion';

export default createConnection({
  connection: {
    driver:   'sqlite',
    filename: process.env.DB_FILE ?? './database/app.db',
  },
  migrations: { path: './src/database/migrations' },
});
```

```ts [SQLite in-memory]
import { createConnection } from '@wrsouza/orion';

export default createConnection({
  connection: {
    driver:   'sqlite',
    filename: ':memory:',
  },
  migrations: { path: './src/database/migrations' },
});
```

:::

### Morph Map

Register short aliases for polymorphic `*_type` columns. Without a morph map, Orion stores the full class name (`'Post'`). With one, it stores the alias (`'post'`):

```ts
import { createConnection } from '@wrsouza/orion';
import { Post } from './models/Post';
import { Video } from './models/Video';

export default createConnection({
  connection: process.env.DATABASE_URL,
  migrations: { path: './src/database/migrations' },
  morphs: {
    post:  Post,
    video: Video,
  },
});
```

### Lazy Loading Guard

Throw a `LazyLoadingViolationError` whenever a relationship is accessed without eager loading. Recommended in development to catch N+1 bugs at runtime:

```ts
import { createConnection } from '@wrsouza/orion';

export default createConnection({
  connection: process.env.DATABASE_URL,
  migrations: { path: './src/database/migrations' },
  preventLazyLoading: process.env.NODE_ENV !== 'production',
});
```

---

## Config File Auto-detection

The Orion CLI searches for your config file in this order:

| Priority | File |
|---|---|
| 1 | `orion.config.ts` |
| 2 | `orion.config.js` |
| 3 | `orion.config.json` |
| 4 | `src/database.ts` ← recommended |
| 5 | `database.ts` |
| 6 | `src/orion.ts` |
| 7 | `orion.ts` |

The recommended approach is `src/database.ts`. The CLI auto-detects it and, if `ts-node` is installed in your project, loads it transparently — no wrapper needed.

```bash
npx orion migrate
npx orion migrate:status
npx orion migrate:rollback
```

You can also add shorthand scripts to your `package.json`:

```json
{
  "scripts": {
    "migrate":          "orion migrate",
    "migrate:rollback": "orion migrate:rollback",
    "migrate:reset":    "orion migrate:reset",
    "migrate:status":   "orion migrate:status",
    "make:migration":   "orion make:migration"
  }
}
```

```bash
npm run migrate
npm run migrate:status
npm run migrate:rollback
```

::: tip ts-node required
The CLI auto-registers `ts-node` from your project's `node_modules` before loading any `.ts` file. Make sure `ts-node` is listed in your `devDependencies`:

```bash
npm install -D ts-node
```
:::

### Custom Config Path

If your config lives outside the default auto-detected paths, use the `--config` flag:

```bash
npx orion --config config/database.ts migrate
```

---

## Multiple Connections

When your application talks to more than one database, pass an array to `createConnection()`. The first entry is always the `default` connection used by all models unless overridden.

```ts
// src/database.ts
import { createConnection } from '@wrsouza/orion';

export default createConnection([
  {
    connection: process.env.DATABASE_URL,
    migrations: { path: './src/database/migrations' },
    preventLazyLoading: process.env.NODE_ENV !== 'production',
  },
  {
    name: 'analytics',
    connection: process.env.ANALYTICS_DATABASE_URL,
    migrations: { path: './src/database/analytics-migrations' },
  },
  {
    name: 'cache',
    connection: process.env.CACHE_DATABASE_URL,
    migrations: { path: './src/database/cache-migrations' },
  },
]);
```

### OrionConfig — per-connection fields

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | — | Connection name. First entry defaults to `'default'` when omitted |
| `connection` | `string \| ConnectionConfig` | ✅ | Database URL or config object |
| `migrations.path` | `string` | — | Path to migrations directory. Default: `./database/migrations` |
| `migrations.table` | `string` | — | Control table name. Default: `orion_migrations` |
| `morphs` | `Record<string, Function>` | — | Polymorphic type alias map (global — typically set on the first entry only) |
| `preventLazyLoading` | `boolean` | — | Throw on un-eager-loaded relation access (global) |

### Pointing a model at a specific connection

```ts
@table({ name: 'page_views', connection: 'analytics' })
class PageView extends Model {}

@table({ name: 'sessions', connection: 'cache' })
class Session extends Model {}
```

### Running migrations on multiple connections

By default the CLI targets the `default` connection. Use `--connection` or `--all` to target others:

```bash
# Default connection only (same behaviour as before)
npx orion migrate

# A specific named connection
npx orion migrate --connection analytics

# All configured connections
npx orion migrate --all
```

The same flags work for `migrate:rollback`, `migrate:reset`, and `migrate:status`.

To generate a migration file in a specific connection's directory:

```bash
npx orion make:migration create_events_table --connection analytics
```

---

## URL Reference

### URL Format

```
<scheme>://<user>:<password>@<host>:<port>/<database>[?<params>]
```

### Examples

```
postgres://alice:secret@db.example.com:5432/myapp?ssl=true&pool_max=20
mysql://root:pass@127.0.0.1:3306/myapp
mariadb://user:pass@localhost/myapp
sqlserver://sa:Pass123@localhost:1433/myapp
sqlite:///./database/app.db
sqlite://:memory:
```

### Query Parameters

| Parameter | Description | Example |
|---|---|---|
| `ssl=true` | Enable SSL/TLS | `?ssl=true` |
| `ssl=false` | Disable SSL/TLS | `?ssl=false` |
| `pool_max=N` | Maximum pool size | `?pool_max=20` |
