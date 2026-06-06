# Getting Started

- [Introduction](#introduction)
- [Installation](#installation)
- [Configuration](#configuration)
  - [SQLite](#sqlite-configuration)
  - [Multiple Connections](#multiple-connections)
- [Defining Models](#defining-models)
  - [Table Names](#table-names)
  - [Primary Keys](#primary-keys)
  - [Timestamps](#timestamps)
  - [Default Attribute Values](#default-attribute-values)
  - [Strictness](#strictness)
- [Retrieving Models](#retrieving-models)
  - [Single Records](#single-records)
  - [Aggregates](#aggregates)
- [Inserting and Updating](#inserting-and-updating)
  - [Inserts](#inserts)
  - [Updates](#updates)
  - [Mass Assignment](#mass-assignment)
  - [Upserts](#upserts)
- [Deleting Models](#deleting-models)
- [Comparing Models](#comparing-models)
- [Dirty Tracking](#dirty-tracking)
- [Replicating Models](#replicating-models)

---

## Introduction

Orion is an Active Record ORM for TypeScript. Each database table has a corresponding model class that is used to interact with that table. Models allow you to query, insert, update, and delete records while tracking dirty state, firing lifecycle events, and managing relationships.

Orion is inspired by Laravel's Eloquent and follows the same conventions. If you know Eloquent, you already know most of Orion's API.

---

## Installation

```bash
npm install orion
```

Install the peer dependency for your database driver:

```bash
npm install pg             # PostgreSQL
npm install mysql2         # MySQL
npm install mariadb        # MariaDB
npm install better-sqlite3 # SQLite
npm install mssql          # SQL Server
```

Enable TypeScript decorators in your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "target": "ES2022"
  }
}
```

---

## Configuration

Create `orion.config.js` at your project root:

```js
// orion.config.js
module.exports = {
  connection: {
    driver: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: 5432,
    database: process.env.DB_NAME || 'myapp',
    user:     process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS || '',
    ssl: false,
    pool: {
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    },
  },
  migrations: {
    path:  './database/migrations',
    table: 'orion_migrations', // default — tracks migration history
  },
};
```

Bootstrap the connection in your application entry point (once, at startup):

```ts
import { ConnectionManager } from 'orion';
import config from './orion.config.js';

ConnectionManager.addConnection('default', config.connection);
```

### Connection via URL

The most common pattern in cloud environments is a single `DATABASE_URL` environment variable. Use `addConnectionUrl()` to connect directly from a URL — the driver is inferred from the scheme:

```ts
import { ConnectionManager } from 'orion';

ConnectionManager.addConnectionUrl('default', process.env.DATABASE_URL!);
```

Supported URL schemes:

| Scheme | Driver |
|--------|--------|
| `postgres://` or `postgresql://` | PostgreSQL |
| `mysql://` | MySQL |
| `mariadb://` | MariaDB |
| `sqlserver://` or `mssql://` | SQL Server |
| `sqlite:///` | SQLite (file) |
| `sqlite://:memory:` | SQLite (in-memory) |

Examples:

```
postgres://alice:secret@db.example.com:5432/myapp?ssl=true
mysql://root:pass@127.0.0.1:3306/myapp
mariadb://user:pass@localhost/myapp
sqlserver://sa:Pass123@localhost:1433/myapp
sqlite:///./database/app.db
sqlite://:memory:
```

Query string parameters:

| Parameter | Description |
|-----------|-------------|
| `ssl=true` | Enable SSL/TLS |
| `ssl=false` | Disable SSL/TLS |
| `pool_max=10` | Maximum pool size |

You can also use `parseConnectionUrl()` if you need the parsed config object separately:

```ts
import { parseConnectionUrl, ConnectionManager } from 'orion';

const config = parseConnectionUrl(process.env.DATABASE_URL!);
// { driver: 'postgres', host: 'db.example.com', port: 5432, database: 'myapp', ... }

ConnectionManager.addConnection('default', { ...config, pool: { max: 20 } });
```

### SQLite Configuration

```js
module.exports = {
  connection: {
    driver:   'sqlite',
    filename: './database/app.db', // or ':memory:' for in-memory
  },
};
```

### Multiple Connections

```ts
ConnectionManager.addConnection('primary', {
  driver: 'postgres', host: 'db-primary', database: 'app',
  user: 'pg', password: process.env.PRIMARY_PASS,
});

ConnectionManager.addConnection('replica', {
  driver: 'postgres', host: 'db-replica', database: 'app',
  user: 'pg_ro', password: process.env.REPLICA_PASS,
});

ConnectionManager.setDefaultConnection('primary');
```

Assign a model to a specific connection:

```ts
@table({ name: 'analytics_events', connection: 'replica' })
class AnalyticsEvent extends Model {}
```

---

## Defining Models

```ts
import { Model, table, fillable, guarded, casts, hidden, visible, appends } from 'orion';

@table('users')
@fillable(['name', 'email', 'password'])
@hidden(['password', 'remember_token'])
@casts({ is_active: 'boolean', settings: 'json', born_at: 'date' })
class User extends Model {
  declare id: number;
  declare name: string;
  declare email: string;
  declare password: string;
  declare is_active: boolean;
  declare settings: Record<string, unknown>;
  declare born_at: Date;
}
```

### Table Names

By convention, the table name is the plural snake_case of the class name:

| Class | Inferred table |
|-------|---------------|
| `User` | `users` |
| `BlogPost` | `blog_posts` |
| `AirTrafficController` | `air_traffic_controllers` |

Override with `@table`:

```ts
@table('my_users')
class User extends Model {}
```

### Primary Keys

The default primary key column is `id`, assumed to be an auto-incrementing integer.

Override key properties:

```ts
@table({ name: 'articles', primaryKey: 'article_uuid', incrementing: false, keyType: 'string' })
class Article extends Model {
  declare article_uuid: string;
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `primaryKey` | `'id'` | PK column name |
| `incrementing` | `true` | Whether the PK is auto-increment |
| `keyType` | `'number'` | `'number'` or `'string'` |

### Timestamps

Orion automatically manages `created_at` and `updated_at` columns. Include them in your migration:

```ts
table.timestamps(); // adds created_at and updated_at
```

Disable timestamps:

```ts
@withoutTimestamps
class Log extends Model {}

// or via @table:
@table({ name: 'logs', timestamps: false })
class Log extends Model {}
```

### Default Attribute Values

```ts
@table('orders')
class Order extends Model {
  protected _defaults = {
    status:   'pending',
    currency: 'USD',
    quantity: 1,
  };
}

const order = new Order();
order.status; // 'pending'
```

### Strictness

By default, assigning a non-fillable attribute is silently ignored. Enable strict mode to throw instead:

```ts
Model.preventSilentlyDiscardingAttributes();
```

---

## Retrieving Models

### All Records

```ts
const users = await User.all(); // returns ModelCollection<User>
```

### Filtering with the Query Builder

```ts
const actives = await User
  .where('is_active', true)
  .where('age', '>=', 18)
  .orderBy('name')
  .get();
```

### Single Records

```ts
// By primary key
const user = await User.find(1);             // User | null
const user = await User.findOrFail(1);       // User  — throws ModelNotFoundException

// By attribute
const user = await User.firstWhere('email', 'alice@example.com');
const user = await User.where('email', 'alice@example.com').first();

// Find or run a callback
const user = await User.findOr(99, async () => {
  return await User.create({ name: 'Guest' });
});

// First or create / first or new
const user = await User.firstOrCreate(
  { email: 'alice@example.com' },   // search attributes
  { name: 'Alice' }                 // values to set on create
);

const user = await User.firstOrNew(
  { email: 'alice@example.com' },
  { name: 'Alice' }
);
// firstOrNew does NOT persist — call user.save() yourself

// Update or create
const user = await User.updateOrCreate(
  { email: 'alice@example.com' },
  { name: 'Alice Updated', is_active: true }
);
```

### Aggregates

```ts
const total  = await User.count();
const active = await User.where('is_active', true).count();
const maxAge = await User.max('age');
const minAge = await User.min('age');
const avgAge = await User.avg('age');
const sum    = await User.sum('balance');
const found  = await User.where('email', 'a@b.com').exists();
```

---

## Inserting and Updating

### Inserts

```ts
// Static create — inserts immediately and returns the new instance
const user = await User.create({ name: 'Alice', email: 'alice@example.com' });

console.log(user.id);                 // auto-populated from DB
console.log(user.wasRecentlyCreated); // true
console.log(user.created_at);         // Date

// Instance approach
const user = new User();
user.name  = 'Bob';
user.email = 'bob@example.com';
await user.save();
```

### Updates

```ts
const user = await User.findOrFail(1);

// One attribute at a time
user.name = 'Alice B.';
await user.save();

// Multiple attributes at once
await user.update({ name: 'Alice C.', is_active: false });

// Transaction-wrapped — throws if the operation fails
await user.saveOrFail();
await user.updateOrFail({ name: 'Alice D.' });
```

Mass update via the query builder (does not fire per-model events):

```ts
await User.where('is_active', false).update({ status: 'archived' });
```

### Mass Assignment

Orion requires explicit mass-assignment declaration:

```ts
@fillable(['name', 'email'])    // allowlist — only these columns are accepted
class User extends Model {}

@guarded(['is_admin'])          // blocklist — all columns except this one
class Post extends Model {}

// @guarded([]) — accept everything (disable all protection)
```

### Upserts

```ts
await User.upsert(
  [
    { email: 'alice@example.com', name: 'Alice' },
    { email: 'bob@example.com',   name: 'Bob' },
  ],
  ['email'],   // unique columns used to detect conflicts
  ['name']     // columns to update on conflict
);
```

---

## Deleting Models

```ts
const user = await User.findOrFail(1);

await user.delete();         // delete this row
await user.deleteOrFail();   // same, but throws if deletion is cancelled by an event

// Static bulk delete — does NOT fire per-model events
await User.where('is_active', false).delete();

// Static delete with events — fires events per model
await User.destroy(1);
await User.destroy(1, 2, 3);
await User.destroyAndFire(1, 2); // alias for destroy

// Force delete (bypasses soft deletes)
await User.forceDestroy(1, 2);

// Truncate the entire table
await User.truncate();
```

---

## Comparing Models

```ts
const userA = await User.find(1);
const userB = await User.find(1);
const userC = await User.find(2);

userA.is(userB);    // true  — same PK and table
userA.is(userC);    // false
userA.isNot(userC); // true
```

---

## Dirty Tracking

Orion tracks which attributes have changed since the model was last loaded or saved.

```ts
const user = await User.findOrFail(1);
user.name = 'New Name';

user.isDirty();           // true — at least one attribute changed
user.isDirty('name');     // true
user.isDirty('email');    // false
user.isClean('email');    // true
user.isClean();           // false

user.getOriginal('name'); // original value before any change
user.getOriginal();       // all original values

await user.save();

user.wasChanged('name');  // true — name changed in the last save
user.wasChanged('email'); // false
user.getChanges();        // { name: 'New Name' } — attrs changed in last save
user.getPrevious('name'); // 'Old Name' — snapshot before last save
user.isDirty();           // false
```

---

## Replicating Models

```ts
const post = await Post.findOrFail(1);

// Create an unsaved copy, excluding primary key and timestamps by default
const copy = post.replicate();

// Exclude additional columns
const copy = post.replicate(['slug', 'published_at']);

// Modify and save
copy.title = 'Copy of ' + copy.title;
await copy.save();
```
