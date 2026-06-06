# Query Builder

- [Introduction](#introduction)
- [Running Queries](#running-queries)
- [Select](#select)
- [Where Clauses](#where-clauses)
  - [Basic Where](#basic-where)
  - [orWhere](#orwhere)
  - [whereIn / whereNotIn](#wherein--wherenotin)
  - [whereNull / whereNotNull](#wherenull--wherenotnull)
  - [whereBetween](#wherebetween)
  - [whereLike](#wherelike)
  - [whereDate / whereYear / whereMonth](#wheredate--whereyear--wheremonth)
  - [whereColumn](#wherecolumn)
  - [Logical Grouping](#logical-grouping)
  - [Subquery Where](#subquery-where)
- [Ordering, Grouping, Limit](#ordering-grouping-limit)
- [Joins](#joins)
- [Aggregates](#aggregates)
- [Raw Expressions](#raw-expressions)
- [Insert, Update, Delete](#insert-update-delete)
- [Subqueries in Select](#subqueries-in-select)
- [Transactions](#transactions)

---

## Introduction

Every `Model` has a fluent query builder accessible via `Model.query()` or any static query method (`where`, `orderBy`, etc.). You can also use the `QueryBuilder` directly against a connection for raw query building.

The query builder produces dialect-correct SQL for all five supported databases. You never write a parameter placeholder yourself — Orion handles it per driver (`$1`/`$2` for Postgres, `?` for MySQL/SQLite/MariaDB, `@p1` for SQL Server).

---

## Running Queries

```ts
// get() returns ModelCollection<T>
const users = await User.where('is_active', true).get();

// first() returns T | null
const user = await User.where('email', 'alice@example.com').first();

// find() by PK
const user = await User.find(1);

// Pluck a single column as an array
const emails = await User.where('is_active', true).pluck('email');
// ['alice@example.com', 'bob@example.com']

// Value — single column from first row
const name = await User.where('id', 1).value('name');
```

---

## Select

```ts
// Select specific columns
const users = await User.select('id', 'name', 'email').get();

// Add columns on top of an existing select
const users = await User.select('id').addSelect('name').get();

// Distinct
const countries = await User.distinct().pluck('country');
```

---

## Where Clauses

### Basic Where

The `where` method accepts three forms:

```ts
// Column, value (implicit =)
User.where('is_active', true)

// Column, operator, value
User.where('age', '>=', 18)
User.where('name', '!=', 'Guest')
User.where('score', '<>', 0)

// Supported operators: = != <> < > <= >= LIKE NOT LIKE ILIKE
```

### orWhere

```ts
const users = await User
  .where('role', 'admin')
  .orWhere('role', 'editor')
  .get();
```

> **Note:** `orWhere` at the top level can produce unintended results when combined with other `where` calls. Use logical grouping for complex conditions.

### whereIn / whereNotIn

```ts
await User.whereIn('id', [1, 2, 3]).get();
await User.whereNotIn('status', ['banned', 'suspended']).get();
await User.orWhereIn('role', ['admin', 'moderator']).get();
```

### whereNull / whereNotNull

```ts
await User.whereNull('deleted_at').get();
await User.whereNotNull('email_verified_at').get();
await User.orWhereNull('bio').get();
```

### whereBetween

```ts
await Order.whereBetween('total', [100, 500]).get();
await Order.whereNotBetween('created_at', [startDate, endDate]).get();
```

### whereLike

```ts
await User.whereLike('name', 'Ali%').get();    // case-sensitive
await User.whereILike('name', 'ali%').get();   // case-insensitive
await User.whereNotLike('email', '%@spam.com').get();
```

### whereDate / whereYear / whereMonth

```ts
await Order.whereDate('created_at', '2024-01-15').get();
await Order.whereYear('created_at', 2024).get();
await Order.whereMonth('created_at', 1).get();     // January
await Order.whereDay('created_at', 15).get();
await Order.whereTime('created_at', '>', '09:00').get();
```

### whereColumn

Compare two columns in the same row:

```ts
await Order.whereColumn('shipped_at', '>', 'created_at').get();
await Order.whereColumn('first_name', 'last_name').get(); // implicit =
```

### Logical Grouping

Use a closure to group OR conditions so they don't bleed into other clauses:

```ts
const users = await User
  .where('is_active', true)
  .where((q) => {
    q.where('role', 'admin').orWhere('is_superuser', true);
  })
  .get();
// SELECT * FROM users WHERE is_active = true AND (role = 'admin' OR is_superuser = true)
```

### Subquery Where

```ts
// whereExists
const users = await User
  .whereExists((q) => {
    q.from('orders').whereColumn('orders.user_id', 'users.id');
  })
  .get();

// whereNotExists
const users = await User.whereNotExists((q) => {
  q.from('orders').whereColumn('orders.user_id', 'users.id');
}).get();

// Subquery value comparison
const users = await User.where('balance', '>', (q) => {
  q.from('accounts').selectRaw('AVG(balance)').whereColumn('user_id', 'users.id');
}).get();
```

---

## Ordering, Grouping, Limit

### orderBy

```ts
await User.orderBy('name').get();             // ASC by default
await User.orderBy('created_at', 'desc').get();
await User.orderBy('last_name').orderBy('first_name').get(); // chain
await User.latest().get();                    // ORDER BY created_at DESC
await User.oldest().get();                    // ORDER BY created_at ASC
await User.inRandomOrder().get();
```

### groupBy / having

```ts
const stats = await Order
  .select('user_id')
  .selectRaw('COUNT(*) as order_count')
  .selectRaw('SUM(total) as total_amount')
  .groupBy('user_id')
  .having('order_count', '>', 5)
  .get();
```

### limit / offset / forPage

```ts
await User.limit(10).get();
await User.limit(10).offset(20).get();
await User.forPage(3, 15).get(); // page 3 with 15 per page = LIMIT 15 OFFSET 30
```

---

## Joins

### Inner Join

```ts
const posts = await Post
  .join('users', 'posts.user_id', '=', 'users.id')
  .select('posts.*', 'users.name as author_name')
  .get();
```

### Left / Right Join

```ts
await User
  .leftJoin('orders', 'users.id', '=', 'orders.user_id')
  .select('users.*', 'orders.total')
  .get();

await Order.rightJoin('users', 'orders.user_id', '=', 'users.id').get();
```

### Cross Join

```ts
await Product.crossJoin('colors').get();
```

### Advanced Join Conditions

```ts
await User
  .join('contacts', (join) => {
    join.on('users.id', '=', 'contacts.user_id')
        .orOn('users.id', '=', 'contacts.secondary_user_id');
  })
  .get();
```

### Sub-select Joins

```ts
const latestOrders = Order
  .select('user_id')
  .selectRaw('MAX(created_at) as last_order_at')
  .groupBy('user_id');

await User
  .joinSub(latestOrders, 'latest_orders', 'users.id', '=', 'latest_orders.user_id')
  .get();
```

---

## Aggregates

```ts
const count = await User.count();
const count = await User.where('is_active', true).count('id');
const max   = await User.max('age');
const min   = await User.min('age');
const avg   = await User.avg('score');
const sum   = await User.sum('balance');
const found = await User.where('email', 'a@b.com').exists();
```

---

## Raw Expressions

Use raw expressions when you need database-specific SQL that the builder cannot produce.

```ts
import { raw } from 'orion';

// Raw in select
const users = await User
  .selectRaw('name, UPPER(email) as email_upper')
  .get();

// Raw in where
const users = await User
  .whereRaw('LOWER(email) = ?', ['alice@example.com'])
  .get();

// orWhereRaw
const users = await User
  .where('is_active', true)
  .orWhereRaw('age > ? AND country = ?', [18, 'BR'])
  .get();

// Raw in having
await Order
  .groupBy('user_id')
  .havingRaw('SUM(total) > ?', [1000])
  .get();

// Raw in orderBy
await User.orderByRaw('FIELD(status, "active", "pending", "inactive")').get();

// Inline raw expression (use sparingly — not parameterized)
const users = await User
  .select(raw('COUNT(*) as total'), 'country')
  .groupBy('country')
  .get();
```

> **Security:** Always use `whereRaw` with `?` placeholders and a parameter array. Never interpolate user input directly into raw strings.

---

## Insert, Update, Delete

These methods execute immediately on the connection — they do not go through model events.

```ts
// Insert
await User.insert({ name: 'Alice', email: 'alice@example.com' });
await User.insert([
  { name: 'Alice', email: 'a@example.com' },
  { name: 'Bob',   email: 'b@example.com' },
]);

// Insert and get the new ID
const id = await User.insertGetId({ name: 'Carol', email: 'c@example.com' });

// Update
await User.where('is_active', false).update({ status: 'archived' });

// Increment / Decrement
await User.where('id', 1).increment('login_count');
await User.where('id', 1).increment('balance', 50);
await User.where('id', 1).decrement('credits', 10);

// Delete
await User.where('created_at', '<', cutoffDate).delete();

// Truncate
await User.truncate();
```

---

## Subqueries in Select

Add a correlated subquery as a selected column:

```ts
const users = await User
  .select('id', 'name')
  .selectSub((q) => {
    q.from('orders')
     .selectRaw('COUNT(*)')
     .whereColumn('orders.user_id', 'users.id');
  }, 'orders_count')
  .get();

// user.getRelation<number>('orders_count') → 5
```

Or use `addSubSelect`:

```ts
const users = await User
  .addSubSelect((q) => {
    q.from('posts').selectRaw('MAX(created_at)').whereColumn('posts.user_id', 'users.id');
  }, 'latest_post_at')
  .get();
```

---

## Transactions

```ts
import { ConnectionManager } from 'orion';

const db = ConnectionManager.getConnection();

await db.transaction(async (trx) => {
  await trx.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [100, 1]);
  await trx.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [100, 2]);
  // if an exception is thrown, the transaction is automatically rolled back
});
```

Nested transactions use savepoints automatically:

```ts
await db.transaction(async (outer) => {
  await outer.query('INSERT INTO logs (msg) VALUES ($1)', ['outer start']);

  await outer.transaction(async (inner) => {
    await inner.query('INSERT INTO logs (msg) VALUES ($1)', ['inner']);
    // throwing here rolls back only to the savepoint, not the whole outer transaction
  });
});
```
