# Getting Started

- [Introduction](#introduction)
- [Installation](#installation)
- [Configuration](#configuration)
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

Create a `src/database.ts` file and call `createConnection()` — this is the single source of truth for your connection, migrations path, and optional behaviours. The Orion CLI auto-detects this file, so no extra config is needed.

```ts
// src/database.ts
import { createConnection } from '@wrsouza/orion';

export default createConnection({
  connection: process.env.DATABASE_URL,
  migrations: { path: './src/database/migrations' },
  preventLazyLoading: process.env.NODE_ENV !== 'production',
});
```

Then import it once at your application entry point:

```ts
import './database'; // connection registered — ready to use
```

For full details — all drivers, framework-specific examples (Express, Fastify, NestJS, Next.js, React Router), multiple connections, and URL reference — see the **[Connection](/connection)** guide.

### Multiple Connections

```ts
// src/database.ts
import { createConnection, ConnectionManager } from '@wrsouza/orion';

export default createConnection({
  connection: process.env.DATABASE_URL,
  migrations: { path: './src/database/migrations' },
});

ConnectionManager.addConnection('replica', {
  driver: 'postgres', host: 'db-replica', database: 'app',
  user: 'pg_ro', password: process.env.REPLICA_PASS,
});
```

Assign a model to a specific connection:

```ts
@table({ name: 'analytics_events', connection: 'replica' })
class AnalyticsEvent extends Model {}
```

---

## Defining Models

```ts
import { Model, table, map, cast, Cast, hidden } from '@wrsouza/orion';

@table('users')
export class User extends Model {
  declare id: number;
  declare name: string;
  declare email: string;

  @hidden()
  declare password: string;

  @map('is_active')
  @cast(Cast.Boolean)
  declare isActive: boolean;

  @map('settings')
  @cast(Cast.Json)
  declare settings: Record<string, unknown>;

  @map('born_at')
  @cast(Cast.Date)
  declare bornAt: Date;
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
// UUID primary key — @uuid() sets incrementing: false and keyType: 'string' automatically
@table('articles')
class Article extends Model {
  @uuid()
  declare id: string;
}

// Custom PK column name with manual config
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

By default, assigning an unknown attribute is silently ignored. Enable strict mode to throw instead:

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

Orion accepts all columns by default. TypeScript's type system enforces what can be passed at compile time, so no runtime allowlist is needed:

```ts
const user = await User.create({ name: 'Alice', email: 'alice@example.com' });
// passing an unknown key → TypeScript compile error
```

Use `@fillable` to restrict which attributes may be mass-assigned at runtime:

```ts
import { fillable } from '@wrsouza/orion';

@table('users')
@fillable(['name', 'email'])
class User extends Model {}
```

Enable strict mode to throw `MassAssignmentException` when a non-fillable key is passed:

```ts
import { Model, MassAssignmentException } from '@wrsouza/orion';

Model.preventSilentlyDiscardingAttributes();

try {
  await User.create({ name: 'Alice', role: 'admin' }); // 'role' not fillable
} catch (e) {
  if (e instanceof MassAssignmentException) {
    // [orion] Add [role] to fillable on [User] to allow mass assignment.
  }
}
```

See [Error Handling](/error-handling) for details on `MassAssignmentException` and all other Orion exceptions.

Use `@hidden` to exclude sensitive fields from JSON serialization:

```ts
@hidden(['password'])
class User extends Model {}
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
