# Connection

- [Overview](#overview)
- [createConnection()](#createconnection)
  - [Connection via URL](#connection-via-url)
  - [Connection via Config Object](#connection-via-config-object)
  - [Morph Map](#morph-map)
  - [Lazy Loading Guard](#lazy-loading-guard)
- [Config File Auto-detection](#config-file-auto-detection)
  - [Custom Config Path](#custom-config-path)
- [Framework Integration](#framework-integration)
  - [Express](#express)
  - [Fastify](#fastify)
  - [NestJS](#nestjs)
  - [Next.js](#nextjs)
  - [React Router v7 (Framework Mode)](#react-router-v7-framework-mode)
- [Multiple Connections](#multiple-connections)
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

---

## createConnection()

```ts
import { createConnection } from '@wrsouza/orion';

createConnection(config: OrionConfig): OrionConfig
```

### OrionConfig

| Field | Type | Required | Description |
|---|---|---|---|
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

The recommended approach is `src/database.ts`. Because the config file is TypeScript, the CLI must be invoked through `ts-node/register` — add these scripts to your `package.json` once and use them from then on:

```json
{
  "scripts": {
    "migrate":          "node -r ts-node/register node_modules/@wrsouza/orion/dist/cli/index.js migrate",
    "migrate:rollback": "node -r ts-node/register node_modules/@wrsouza/orion/dist/cli/index.js migrate:rollback",
    "migrate:reset":    "node -r ts-node/register node_modules/@wrsouza/orion/dist/cli/index.js migrate:reset",
    "migrate:status":   "node -r ts-node/register node_modules/@wrsouza/orion/dist/cli/index.js migrate:status",
    "make:migration":   "node -r ts-node/register node_modules/@wrsouza/orion/dist/cli/index.js make:migration"
  }
}
```

Then use the scripts normally:

```bash
npm run migrate
npm run migrate:status
npm run migrate:rollback
```

::: warning Avoid npx orion directly
Running `npx orion migrate` without `ts-node/register` will fail with
_"Cannot use import statement outside a module"_ when your config file is TypeScript.
Always use the `npm run` scripts shown above.
:::

### Custom Config Path

If your config lives outside the default auto-detected paths, use the `--config` flag in your `package.json` script:

```json
{
  "scripts": {
    "migrate": "node -r ts-node/register node_modules/@wrsouza/orion/dist/cli/index.js --config config/database.ts migrate"
  }
}
```

---

## Framework Integration

All examples follow the same pattern: create `src/database.ts` once, then import it at your framework's entry point. The `package.json` scripts from the [Config File Auto-detection](#config-file-auto-detection) section handle the CLI for all frameworks.

### Express

::: code-group

```ts [src/database.ts]
import { createConnection } from '@wrsouza/orion';

export default createConnection({
  connection: process.env.DATABASE_URL ?? {
    driver:   'postgres',
    host:     process.env.DB_HOST ?? 'localhost',
    database: process.env.DB_NAME ?? 'myapp',
    user:     process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASS ?? '',
  },
  migrations: { path: './src/database/migrations' },
  preventLazyLoading: process.env.NODE_ENV !== 'production',
});
```

```ts [src/server.ts]
import './database';           // ← bootstraps Orion
import express from 'express';
import { userRouter } from './routes/users';

const app = express();
app.use(express.json());
app.use('/users', userRouter);

app.listen(3000, () => console.log('Server running on port 3000'));
```

```ts [src/routes/users.ts]
import { Router } from 'express';
import { User } from '../database/models/User';

export const userRouter = Router();

userRouter.get('/', async (_req, res) => {
  res.json(await User.all());
});

userRouter.post('/', async (req, res) => {
  res.status(201).json(await User.create(req.body));
});

userRouter.get('/:id', async (req, res) => {
  const user = await User.find(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json(user);
});
```

:::

### Fastify

::: code-group

```ts [src/database.ts]
import { createConnection } from '@wrsouza/orion';

export default createConnection({
  connection: process.env.DATABASE_URL ?? {
    driver:   'postgres',
    host:     process.env.DB_HOST ?? 'localhost',
    database: process.env.DB_NAME ?? 'myapp',
    user:     process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASS ?? '',
  },
  migrations: { path: './src/database/migrations' },
  preventLazyLoading: process.env.NODE_ENV !== 'production',
});
```

```ts [src/server.ts]
import './database';           // ← bootstraps Orion
import Fastify from 'fastify';
import { User } from './database/models/User';

const app = Fastify({ logger: true });

app.get('/users', async () => User.all());

app.post('/users', async (request) => {
  return User.create(request.body as object);
});

app.get('/users/:id', async (request, reply) => {
  const { id } = request.params as { id: string };
  const user = await User.find(id);
  if (!user) return reply.status(404).send({ error: 'Not found' });
  return user;
});

app.listen({ port: 3000 }, () => console.log('Server running on port 3000'));
```

:::

### NestJS

NestJS uses its own DI container. Import `database.ts` inside the `AppModule` constructor so it runs before any provider tries to use a model.

::: code-group

```ts [src/database.ts]
import { createConnection } from '@wrsouza/orion';

export default createConnection({
  connection: process.env.DATABASE_URL ?? {
    driver:   'postgres',
    host:     process.env.DB_HOST ?? 'localhost',
    database: process.env.DB_NAME ?? 'myapp',
    user:     process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASS ?? '',
  },
  migrations: { path: './src/database/migrations' },
  preventLazyLoading: process.env.NODE_ENV !== 'production',
});
```

```ts [src/app.module.ts]
import '../database';          // ← bootstraps Orion before any provider runs
import { Module } from '@nestjs/common';
import { UsersModule } from './users/users.module';

@Module({ imports: [UsersModule] })
export class AppModule {}
```

```ts [src/users/users.service.ts]
import { Injectable } from '@nestjs/common';
import { User } from '../../database/models/User';

@Injectable()
export class UsersService {
  findAll() {
    return User.all();
  }

  findOne(id: string) {
    return User.find(id);
  }

  create(data: Partial<User>) {
    return User.create(data);
  }

  async update(id: string, data: Partial<User>) {
    const user = await User.findOrFail(id);
    await user.update(data);
    return user;
  }

  async remove(id: string) {
    const user = await User.findOrFail(id);
    await user.delete();
  }
}
```

```ts [src/users/users.controller.ts]
import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()    findAll()                       { return this.usersService.findAll(); }
  @Get(':id') findOne(@Param('id') id: string) { return this.usersService.findOne(id); }
  @Post()   create(@Body() body: any)       { return this.usersService.create(body); }
  @Put(':id') update(@Param('id') id: string, @Body() body: any) {
    return this.usersService.update(id, body);
  }
  @Delete(':id') remove(@Param('id') id: string) { return this.usersService.remove(id); }
}
```

:::

### Next.js

In Next.js, database connections must be initialised before route handlers execute. Import `database.ts` inside the root layout (App Router) or `_app.tsx` (Pages Router).

::: code-group

```ts [src/database.ts]
import { createConnection } from '@wrsouza/orion';

export default createConnection({
  connection: process.env.DATABASE_URL ?? {
    driver:   'postgres',
    host:     process.env.DB_HOST ?? 'localhost',
    database: process.env.DB_NAME ?? 'myapp',
    user:     process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASS ?? '',
  },
  migrations: { path: './src/database/migrations' },
});
```

```ts [app/layout.tsx (App Router)]
import '@/database';           // ← bootstraps Orion on every server render
import type { ReactNode } from 'react';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

```ts [app/api/users/route.ts]
import { NextResponse } from 'next/server';
import { User } from '@/database/models/User';

export async function GET() {
  const users = await User.all();
  return NextResponse.json(users);
}

export async function POST(request: Request) {
  const body = await request.json();
  const user = await User.create(body);
  return NextResponse.json(user, { status: 201 });
}
```

```ts [app/api/users/[id]/route.ts]
import { NextResponse } from 'next/server';
import { User } from '@/database/models/User';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await User.find(params.id);
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(user);
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const user = await User.findOrFail(params.id);
  await user.update(await request.json());
  return NextResponse.json(user);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await User.findOrFail(params.id);
  await user.delete();
  return new NextResponse(null, { status: 204 });
}
```

:::

::: warning Server-only
Database access should only happen in Server Components, Route Handlers (`app/api`), or Server Actions. Never import `database.ts` in Client Components.
:::

### React Router v7 (Framework Mode)

React Router v7's framework mode runs loaders and actions on the server. Bootstrap Orion in the root loader so every route has access to the database.

::: code-group

```ts [app/database.ts]
import { createConnection } from '@wrsouza/orion';

export default createConnection({
  connection: process.env.DATABASE_URL ?? {
    driver:   'postgres',
    host:     process.env.DB_HOST ?? 'localhost',
    database: process.env.DB_NAME ?? 'myapp',
    user:     process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASS ?? '',
  },
  migrations: { path: './app/database/migrations' },
});
```

```ts [app/root.tsx]
import './database';           // ← bootstraps Orion
import { Outlet } from 'react-router';
import type { LoaderFunction } from 'react-router';

export const loader: LoaderFunction = async () => {
  return null;
};

export default function Root() {
  return <Outlet />;
}
```

```ts [app/routes/users.tsx]
import type { LoaderFunction, ActionFunction } from 'react-router';
import { useLoaderData } from 'react-router';
import { User } from '../database/models/User';

export const loader: LoaderFunction = async () => {
  return await User.orderBy('name').get();
};

export const action: ActionFunction = async ({ request }) => {
  const body = Object.fromEntries(await request.formData());
  return await User.create(body);
};

export default function UsersPage() {
  const users = useLoaderData<typeof loader>();
  return (
    <ul>
      {users.map((u: any) => <li key={u.id}>{u.name}</li>)}
    </ul>
  );
}
```

:::

---

## Multiple Connections

When your application talks to more than one database, use `ConnectionManager` directly alongside `createConnection()`:

```ts
// src/database.ts
import { createConnection, ConnectionManager } from '@wrsouza/orion';

// Primary connection — used by all models by default
export default createConnection({
  connection: process.env.DATABASE_URL,
  migrations: { path: './src/database/migrations' },
});

// Secondary connections
ConnectionManager.addConnection('analytics', {
  driver:   'postgres',
  host:     process.env.ANALYTICS_DB_HOST ?? 'analytics-db',
  database: 'analytics',
  user:     process.env.ANALYTICS_DB_USER ?? 'analytics',
  password: process.env.ANALYTICS_DB_PASS ?? '',
});

ConnectionManager.addConnection('cache', {
  driver:   'mysql',
  host:     process.env.CACHE_DB_HOST ?? 'cache-db',
  database: 'cache',
  user:     process.env.CACHE_DB_USER ?? 'cache',
  password: process.env.CACHE_DB_PASS ?? '',
});
```

Point a model at a specific connection:

```ts
@table({ name: 'page_views', connection: 'analytics' })
class PageView extends Model {}

@table({ name: 'sessions', connection: 'cache' })
class Session extends Model {}
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
