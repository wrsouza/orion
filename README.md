# Orion

> An Eloquent-inspired Active Record ORM for TypeScript — built from scratch, no Knex, no TypeORM.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green)](LICENSE)

Orion gives you a fluent, expressive API for working with SQL databases in TypeScript. Models are plain classes. Relationships are method calls. Queries read like English.

```ts
import { Model, table, fillable, hidden } from '@wrsouza/orion';

@table('users')
@fillable(['name', 'email', 'password'])
@hidden(['password'])
class User extends Model {
  declare id: number;
  declare name: string;
  declare email: string;

  posts() {
    return this.hasMany(Post);
  }
}

const user = await User.find(1);
const page = await User.where('active', true).orderBy('name').paginate(15);
const alice = await User.create({ name: 'Alice', email: 'alice@example.com' });
const users = await User.with('posts', 'profile').get();
```

---

## Supported Databases

| Database | Driver value | Peer dependency |
|----------|-------------|-----------------|
| PostgreSQL | `postgres` | `pg` |
| MySQL | `mysql` | `mysql2` |
| MariaDB | `mariadb` | `mariadb` |
| SQLite | `sqlite` | `better-sqlite3` |
| SQL Server | `sqlserver` | `mssql` |

---

## Installation

```bash
npm install @wrsouza/orion
# then install the driver for your database:
npm install pg             # PostgreSQL
npm install mysql2         # MySQL
npm install mariadb        # MariaDB
npm install better-sqlite3 # SQLite
npm install mssql          # SQL Server
```

---

## Quick Setup

**1. Create `orion.config.js`** at your project root:

```js
module.exports = {
  connection: {
    driver: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: 5432,
    database: process.env.DB_NAME || 'myapp',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS || '',
  },
  migrations: {
    path: './database/migrations',
  },
};
```

**2. Bootstrap the connection:**

```ts
import { ConnectionManager } from '@wrsouza/orion';

// Option A — URL (recommended for cloud/12-factor apps)
ConnectionManager.addConnectionUrl('default', process.env.DATABASE_URL!);

// Option B — explicit config (or load from orion.config.js)
import config from './orion.config.js';
ConnectionManager.addConnection('default', config.connection);
```

**3. Define a model and query:**

```ts
import { Model, table, fillable, casts } from '@wrsouza/orion';

@table('users')
@fillable(['name', 'email'])
@casts({ is_active: 'boolean', born_at: 'date' })
class User extends Model {
  declare id: number;
  declare name: string;
  declare email: string;
  declare is_active: boolean;
}

const user  = await User.create({ name: 'Alice', email: 'alice@example.com' });
const users = await User.where('is_active', true).orderBy('name').get();
```

---

## Documentation

| Page | Description |
|------|-------------|
| [Getting Started](docs/getting-started.md) | Installation, configuration, model conventions, CRUD |
| [Query Builder](docs/query-builder.md) | Full fluent query API — where, joins, aggregates, subqueries |
| [Relationships](docs/relationships.md) | hasOne, hasMany, belongsTo, belongsToMany, polymorphic, eager loading |
| [Collections](docs/collections.md) | ModelCollection — PK-based lookups, DB operations, serialization helpers |
| [Mutators & Casting](docs/mutators-casting.md) | Accessors, mutators, cast types, class-based casts |
| [Serialization](docs/serialization.md) | toArray, hidden/visible, appends, date formatting |
| [Scopes & Events](docs/scopes-events.md) | Global/local scopes, lifecycle events, observers |
| [API Resources](docs/api-resources.md) | Resource transformers, conditional fields, JSON:API |
| [Factories](docs/factories.md) | Test factories, sequences, relationship factories |
| [Pagination](docs/pagination.md) | paginate(), simplePaginate(), chunk(), cursor() |
| [Soft Deletes](docs/soft-deletes.md) | SoftDeletes mixin — soft delete, restore, force delete |
| [Pruning](docs/pruning.md) | Prunable, MassPrunable, CLI model:prune |
| [UUID / ULID](docs/uuid-ulid.md) | HasUuids, HasUlids mixins |
| [Schema & Migrations](docs/schema-migrations.md) | Schema builder, Blueprint, migrations, CLI |

---

## CLI

```bash
npx orion migrate                        # run pending migrations
npx orion migrate:rollback [--step=N]    # roll back N batches
npx orion migrate:reset                  # roll back everything
npx orion migrate:status                 # show migration status
npx orion make:migration <name>          # generate a migration file
npx orion model:prune [--model=X]        # delete pruneable records
```

---

## License

MIT
