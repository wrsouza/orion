# Orion

> An Eloquent-inspired Active Record ORM for TypeScript.

[![npm](https://img.shields.io/npm/v/@wrsouza/orion)](https://www.npmjs.com/package/@wrsouza/orion)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4+-blue)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green)](LICENSE)
[![Documentation](https://img.shields.io/badge/docs-wrsouza.github.io%2Forion-blue)](https://wrsouza.github.io/orion/)

Orion gives you a fluent, expressive API for working with SQL databases in TypeScript. Models are plain classes. Relationships are method calls. Queries read like English.

```ts
import { Model, table, fillable, hidden, map, HasUuids } from '@wrsouza/orion';

@table({ name: 'users', primaryKey: 'id', incrementing: false, keyType: 'string' })
@fillable(['name', 'email', 'password'])
@hidden(['password'])
class User extends HasUuids(Model) {
  declare id: string;
  declare name: string;
  declare email: string;

  @map('created_at') declare createdAt: Date;
  @map('updated_at') declare updatedAt: Date;

  posts() {
    return this.hasMany(Post, 'user_id');
  }
}

const user  = await User.create({ name: 'Alice', email: 'alice@example.com' });
const page  = await User.where('active', true).orderBy('name').paginate(15);
const users = await User.with('posts').get();
```

---

## Supported Databases

| Database | Driver | Peer dependency |
|---|---|---|
| PostgreSQL | `postgres` | `npm install pg` |
| MySQL | `mysql` | `npm install mysql2` |
| MariaDB | `mariadb` | `npm install mariadb` |
| SQLite | `sqlite` | `npm install better-sqlite3` |
| SQL Server | `sqlserver` | `npm install mssql` |

Only install the driver you actually use — the others are not required.

---

## Installation

```bash
npm install @wrsouza/orion

# Install the driver for your database (only one needed):
npm install pg             # PostgreSQL
npm install mysql2         # MySQL
npm install mariadb        # MariaDB
npm install better-sqlite3 # SQLite
npm install mssql          # SQL Server
```

Enable TypeScript decorators in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

---

## Quick Setup

**1. Create `src/database.ts`** — single source of truth for connection, migrations and behaviours:

```ts
import { createConnection } from '@wrsouza/orion';

export default createConnection({
  connection: process.env.DATABASE_URL ?? {
    driver:   'postgres',
    host:     process.env.DB_HOST ?? 'localhost',
    database: process.env.DB_NAME ?? 'myapp',
    user:     process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASS ?? '',
  },
  migrations: {
    path: './src/database/migrations',
  },
  preventLazyLoading: process.env.NODE_ENV !== 'production',
});
```

**2. Import it once at your app entry point:**

```ts
// Express / Fastify / NestJS / Next.js / React Router — same pattern
import './database';
```

**3. Define models and query:**

```ts
import { Model, table, fillable, casts, map, HasUuids } from '@wrsouza/orion';

@table({ name: 'users', primaryKey: 'id', incrementing: false, keyType: 'string' })
@fillable(['name', 'email'])
@casts({ createdAt: 'date', updatedAt: 'date' })
class User extends HasUuids(Model) {
  declare id: string;
  declare name: string;
  declare email: string;

  @map('created_at') declare createdAt: Date;
  @map('updated_at') declare updatedAt: Date;
}

const user  = await User.create({ name: 'Alice', email: 'alice@example.com' });
const users = await User.where('active', true).orderBy('name').get();
```

---

## CLI

Add these scripts to `package.json` once:

```json
{
  "scripts": {
    "migrate":          "orion migrate",
    "migrate:rollback": "orion migrate:rollback",
    "migrate:reset":    "orion migrate:reset",
    "migrate:status":   "orion migrate:status",
    "make:migration":   "orion make:migration",
    "db:seed":          "orion db:seed",
    "make:seed":        "orion make:seed",
    "make:factory":     "orion make:factory"
  }
}
```

| Command | Description |
|---|---|
| `npx orion migrate` | Run all pending migrations |
| `npx orion migrate:rollback [--step=N]` | Roll back N batches (default: 1) |
| `npx orion migrate:reset` | Roll back all migrations |
| `npx orion migrate:status` | Show migration status |
| `npx orion make:migration <name>` | Generate a migration file |
| `npx orion db:seed [--class=Name]` | Run seeders (default: `DatabaseSeeder`) |
| `npx orion make:seed <name>` | Generate a seeder file |
| `npx orion make:factory <name>` | Generate a factory file |
| `npx orion model:prune [--model=X]` | Delete prunable records |
| `npx orion --config <path> <cmd>` | Use a custom config file path |

> **Note:** `ts-node` must be installed as a dev dependency. The CLI registers it automatically so `.ts` config and migration files load without any extra setup.

---

## Seeds & Factories

```ts
// src/database/factories/UserFactory.ts
import { Factory } from '@wrsouza/orion';
import { User } from '../models/User';

export class UserFactory extends Factory<User> {
  model = User;
  definition() {
    return { name: 'Alice', email: `user${Date.now()}@example.com` };
  }
}

// src/database/seeders/UserSeeder.ts
import { Seeder } from '@wrsouza/orion';
import { UserFactory } from '../factories/UserFactory';

export default class UserSeeder extends Seeder {
  async run() {
    await new UserFactory().count(20).create();
  }
}

// src/database/seeders/DatabaseSeeder.ts
import { Seeder } from '@wrsouza/orion';
import UserSeeder from './UserSeeder';

export default class DatabaseSeeder extends Seeder {
  async run() {
    await this.call([UserSeeder]);
  }
}
```

```bash
npx orion db:seed                   # runs DatabaseSeeder
npx orion db:seed --class=UserSeeder  # runs a specific seeder
```

---

## Documentation

| Page | Description |
|---|---|
| [Connection](https://wrsouza.github.io/orion/connection) | `createConnection()`, all drivers, framework integration (Express, NestJS, Next.js, React Router, Fastify) |
| [Getting Started](https://wrsouza.github.io/orion/getting-started) | Installation, model conventions, CRUD |
| [Query Builder](https://wrsouza.github.io/orion/query-builder) | Full fluent query API — where, joins, aggregates, subqueries |
| [Relationships](https://wrsouza.github.io/orion/relationships) | hasOne, hasMany, belongsTo, belongsToMany, polymorphic, eager loading |
| [Collections](https://wrsouza.github.io/orion/collections) | ModelCollection — PK lookups, DB operations, serialization |
| [Mutators & Casting](https://wrsouza.github.io/orion/mutators-casting) | Accessors, mutators, cast types, class-based casts |
| [Serialization](https://wrsouza.github.io/orion/serialization) | toArray, hidden/visible, appends, date formatting |
| [Scopes & Events](https://wrsouza.github.io/orion/scopes-events) | Global/local scopes, lifecycle events, observers |
| [API Resources](https://wrsouza.github.io/orion/api-resources) | Resource transformers, conditional fields, JSON:API |
| [Factories](https://wrsouza.github.io/orion/factories) | Test factories, sequences, relationship factories |
| [Pagination](https://wrsouza.github.io/orion/pagination) | paginate(), simplePaginate(), chunk(), cursor() |
| [Soft Deletes](https://wrsouza.github.io/orion/soft-deletes) | SoftDeletes mixin — soft delete, restore, force delete |
| [Pruning](https://wrsouza.github.io/orion/pruning) | Prunable, MassPrunable, CLI model:prune |
| [UUID / ULID](https://wrsouza.github.io/orion/uuid-ulid) | HasUuids, HasUlids mixins |
| [Schema & Migrations](https://wrsouza.github.io/orion/schema-migrations) | Schema builder, Blueprint, migrations, CLI |

---

## License

MIT
