# Schema & Migrations

- [Introduction](#introduction)
- [Generating Migrations](#generating-migrations)
- [Migration Structure](#migration-structure)
- [Running Migrations](#running-migrations)
- [Rolling Back](#rolling-back)
- [Migration Status](#migration-status)
- [Schema Builder](#schema-builder)
  - [Creating Tables](#creating-tables)
  - [Modifying Tables](#modifying-tables)
  - [Renaming and Dropping Tables](#renaming-and-dropping-tables)
  - [Introspection](#introspection)
- [Column Types](#column-types)
- [Column Modifiers](#column-modifiers)
- [Indexes](#indexes)
- [Foreign Keys](#foreign-keys)
- [Direct Connection Usage](#direct-connection-usage)

---

## Introduction

Orion's migration system tracks which migrations have run and executes pending ones in lexicographic order. Each migration file exports a class with `up()` and `down()` methods. The `Schema` builder provides a dialect-agnostic fluent API for creating and modifying tables.

---

## Generating Migrations

```bash
npx orion make:migration <name>
```

The name drives the template generated:

| Name pattern | Generated `up()` body |
|---|---|
| `create_<table>_table` | `Schema.create('<table>', ...)` |
| `add_<cols>_to_<table>` | `Schema.table('<table>', ...)` stubs |
| Anything else | Empty stubs |

```bash
npx orion make:migration create_users_table
npx orion make:migration add_avatar_to_users
npx orion make:migration create_role_user_table
```

Generated file (`20240601120000_create_users_table.ts`):

```ts
import { Migration, Blueprint } from '@wrsouza/orion';

export default class CreateUsersTable extends Migration {
  async up(): Promise<void> {
    await this.Schema.create('users', (table: Blueprint) => {
      table.id();
      table.timestamps();
    });
  }

  async down(): Promise<void> {
    await this.Schema.dropIfExists('users');
  }
}
```

---

## Migration Structure

```ts
import { Migration, Blueprint } from '@wrsouza/orion';

export default class CreatePostsTable extends Migration {
  async up(): Promise<void> {
    await this.Schema.create('posts', (table: Blueprint) => {
      table.uuid('id').primary();

      // foreignId / foreignUuid: creates the column AND the FK constraint in one call
      table.foreignUuid('user_id').references('id').on('users').onDelete('CASCADE');

      table.string('title');
      table.text('body').nullable();
      table.boolean('published').default(false);
      table.timestamp('published_at').nullable();
      table.timestamps();
    });
  }

  async down(): Promise<void> {
    await this.Schema.dropIfExists('posts');
  }
}
```

`foreignId` and `foreignUuid` create the column **and** register the foreign key in a single fluent call. Separate calls are only needed when you want to declare the column and the constraint independently:

```ts
// One-liner (recommended)
table.foreignUuid('author_id').references('id').on('users').onDelete('SET NULL');

// Equivalent two-step form
table.uuid('author_id');
table.foreign('author_id').references('id').on('users').onDelete('SET NULL');
```

`this.Schema` is pre-configured with the default connection. Use `this.connection` to run raw queries:

```ts
async up(): Promise<void> {
  const conn = this.connection;
  await conn.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"', []);
  await this.Schema.create('users', (table) => {
    table.uuid('id').primary();
    table.string('email').unique();
    table.timestamps();
  });
}
```

---

## Running Migrations

```bash
npx orion migrate
```

All pending migrations run in a single batch. The batch number is saved for grouped rollback.

Output:

```
  Migrating: 20240601120000_create_users_table
  Migrated:  20240601120000_create_users_table (45ms)

  Migrating: 20240601120001_create_posts_table
  Migrated:  20240601120001_create_posts_table (23ms)

  2 migrations ran successfully.
```

---

## Rolling Back

```bash
# Roll back the last batch
npx orion migrate:rollback

# Roll back the last N batches
npx orion migrate:rollback --step=3

# Roll back ALL migrations
npx orion migrate:reset
```

---

## Migration Status

```bash
npx orion migrate:status
```

```
  Status    Batch    Migration
  ──────────────────────────────────────────────────────────────────
  Ran       1        20240601120000_create_users_table
  Ran       1        20240601120001_create_posts_table
  Ran       2        20240605090000_add_avatar_to_users
  Pending   -        20240610150000_create_notifications_table
```

---

## Schema Builder

### Creating Tables

```ts
import { Schema, Blueprint } from '@wrsouza/orion';

await Schema.create('orders', (table: Blueprint) => {
  table.id();
  table.foreignId('user_id').references('id').on('users').onDelete('CASCADE');
  table.string('reference', 20).unique();
  table.decimal('subtotal', 10, 2);
  table.decimal('tax', 10, 2).default(0);
  table.decimal('total', 10, 2);
  table.string('status').default('pending');
  table.json('metadata').nullable();
  table.timestamps();
});
```

### Modifying Tables

```ts
await Schema.table('users', (table: Blueprint) => {
  // Add columns
  table.string('phone', 20).nullable();
  table.string('avatar_url').nullable();

  // Modify (driver-dependent — not all drivers support all modifications)
  table.text('bio').nullable().change();

  // Drop
  table.dropColumn('legacy_field');
  table.dropColumns('old_col1', 'old_col2');
});
```

### Renaming and Dropping Tables

```ts
await Schema.rename('old_table', 'new_table');

await Schema.drop('table_name');
await Schema.dropIfExists('table_name');
```

### Introspection

```ts
const exists  = await Schema.hasTable('users');       // boolean
const hasCol  = await Schema.hasColumn('users', 'email'); // boolean
const columns = await Schema.getColumnListing('users');   // string[]
```

---

## Column Types

| Method | PostgreSQL | MySQL/MariaDB | SQLite | SQL Server |
|--------|-----------|--------------|--------|------------|
| `id(name?)` | `BIGSERIAL PK` | `BIGINT AI PK` | `INTEGER PK AUTOINCREMENT` | `BIGINT IDENTITY PK` |
| `increments(name)` | `SERIAL PK` | `INT AI PK` | `INTEGER PK AI` | `INT IDENTITY PK` |
| `bigIncrements(name)` | `BIGSERIAL PK` | `BIGINT AI PK` | `INTEGER PK AI` | `BIGINT IDENTITY PK` |
| `bigInteger(name)` | `BIGINT` | `BIGINT` | `INTEGER` | `BIGINT` |
| `integer(name)` | `INTEGER` | `INT` | `INTEGER` | `INT` |
| `smallInteger(name)` | `SMALLINT` | `SMALLINT` | `INTEGER` | `SMALLINT` |
| `tinyInteger(name)` | `SMALLINT` | `TINYINT` | `INTEGER` | `TINYINT` |
| `boolean(name)` | `BOOLEAN` | `TINYINT(1)` | `INTEGER` | `BIT` |
| `char(name, n?)` | `CHAR(n)` | `CHAR(n)` | `TEXT` | `CHAR(n)` |
| `string(name, n?)` | `VARCHAR(n)` | `VARCHAR(n)` | `TEXT` | `NVARCHAR(n)` |
| `text(name)` | `TEXT` | `TEXT` | `TEXT` | `NVARCHAR(MAX)` |
| `float(name)` | `REAL` | `FLOAT` | `REAL` | `REAL` |
| `double(name)` | `DOUBLE PRECISION` | `DOUBLE` | `REAL` | `FLOAT` |
| `decimal(name, p?, s?)` | `DECIMAL(p,s)` | `DECIMAL(p,s)` | `REAL` | `DECIMAL(p,s)` |
| `uuid(name?)` | `UUID` | `CHAR(36)` | `TEXT` | `UNIQUEIDENTIFIER` |
| `ulid(name?)` | `CHAR(26)` | `CHAR(26)` | `TEXT` | `CHAR(26)` |
| `json(name)` | `JSON` | `JSON` | `TEXT` | `NVARCHAR(MAX)` |
| `jsonb(name)` | `JSONB` | `JSON` | `TEXT` | `NVARCHAR(MAX)` |
| `timestamp(name)` | `TIMESTAMP` | `TIMESTAMP` | `TEXT` | `DATETIME2` |
| `timestampTz(name)` | `TIMESTAMPTZ` | `TIMESTAMP` | `TEXT` | `DATETIMEOFFSET` |
| `date(name)` | `DATE` | `DATE` | `TEXT` | `DATE` |
| `time(name)` | `TIME` | `TIME` | `TEXT` | `TIME` |
| `binary(name)` | `BYTEA` | `BLOB` | `BLOB` | `VARBINARY(MAX)` |
| `enum(name, values[])` | `VARCHAR CHECK(...)` | `ENUM(...)` | `TEXT CHECK(...)` | `NVARCHAR CHECK(...)` |
| `timestamps()` | — | — | — | — |
| `timestampsTz()` | — | — | — | — |
| `softDeletes(col?)` | — | — | — | — |
| `softDeletesTz(col?)` | — | — | — | — |
| `foreignId(name)` | `BIGINT` | `BIGINT UNSIGNED` | `INTEGER` | `BIGINT` |
| `foreignUuid(name)` | `UUID` | `CHAR(36)` | `TEXT` | `UNIQUEIDENTIFIER` |
| `morphs(name)` | `{name}_type VARCHAR + {name}_id BIGINT + index` | same | same | same |
| `uuidMorphs(name)` | `{name}_type VARCHAR + {name}_id UUID + index` | same | same | same |

**Convenience columns:**

```ts
table.id();               // bigIncrements('id')
table.timestamps();       // created_at TIMESTAMP NULL + updated_at TIMESTAMP NULL
table.timestampsTz();     // with timezone
table.softDeletes();      // deleted_at TIMESTAMP NULL
table.softDeletesTz();    // with timezone
table.rememberToken();    // remember_token VARCHAR(100) NULL
```

---

## Column Modifiers

```ts
table.string('bio').nullable();           // allow NULL
table.integer('views').default(0);       // default value
table.string('code').unique();           // unique constraint
table.bigInteger('ref_id').index();      // regular index
table.integer('score').unsigned();       // CHECK (score >= 0)
table.string('notes').comment('Internal notes');
```

| Modifier | Description |
|----------|-------------|
| `.nullable()` | Column allows `NULL` (default: NOT NULL) |
| `.default(value)` | Sets a default value |
| `.unique()` | Adds a unique constraint |
| `.index()` | Adds a regular index |
| `.unsigned()` | Adds `CHECK (col >= 0)` |
| `.comment(text)` | Column comment (where supported) |
| `.change()` | Modify an existing column (ALTER COLUMN) |

---

## Indexes

```ts
// Composite primary key
table.primary(['user_id', 'role_id']);

// Unique index with custom name
table.unique(['email', 'tenant_id'], 'users_email_tenant_unique');

// Regular index
table.index('created_at');
table.index(['last_name', 'first_name'], 'users_name_idx');

// Drop index
table.dropIndex('users_email_tenant_unique');
table.dropUnique('users_email_unique');
table.dropPrimary();
```

---

## Foreign Keys

```ts
// Shorthand: foreignId + constrained
table.foreignId('user_id')
  .references('id')
  .on('users')
  .onDelete('CASCADE')
  .onUpdate('RESTRICT');

// Manual: foreign()
table.foreign('category_id')
  .references('id')
  .on('categories')
  .onDelete('SET NULL')
  .name('fk_posts_category');

// Drop
table.dropForeign('fk_posts_category');
```

Supported ON DELETE / ON UPDATE actions:

| Value | Behaviour |
|-------|-----------|
| `CASCADE` | Delete/update child rows automatically |
| `SET NULL` | Set FK to NULL |
| `SET DEFAULT` | Set FK to column default |
| `RESTRICT` | Prevent parent delete/update if children exist |
| `NO ACTION` | Same as RESTRICT (default on most drivers) |

---

## Direct Connection Usage

Access the underlying connection for raw queries or transactions without using the model layer:

```ts
import { ConnectionManager } from '@wrsouza/orion';

// Via URL
ConnectionManager.addConnectionUrl('default', 'postgres://postgres:secret@localhost:5432/myapp');

// Or via explicit config
ConnectionManager.addConnection('default', {
  driver: 'postgres',
  host: 'localhost',
  database: 'myapp',
  user: 'postgres',
  password: '',
});

const db = ConnectionManager.getConnection();

// Raw query
const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [1]);

// Transaction
await db.transaction(async (trx) => {
  await trx.query('INSERT INTO accounts (owner, balance) VALUES ($1, $2)', ['Alice', 5000]);
  await trx.query('INSERT INTO audit_log (action) VALUES ($1)', ['account_created']);
});

// Disconnect all connections
await ConnectionManager.disconnectAll();
```

Named connections:

```ts
const primary   = ConnectionManager.getConnection('primary');
const reporting = ConnectionManager.getConnection('reporting');
```
