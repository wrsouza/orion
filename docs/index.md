---
layout: home

hero:
  name: "Orion"
  text: "Active Record ORM for TypeScript"
  tagline: Eloquent-inspired. Five database drivers. Built from scratch.
  image:
    src: /logo.svg
    alt: Orion
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/wrsouza/orion

features:
  - icon: ✨
    title: Eloquent-inspired API
    details: If you know Laravel's Eloquent, you already know Orion. Same fluent API, same conventions — in TypeScript.

  - icon: 🗄️
    title: Five Database Drivers
    details: PostgreSQL, MySQL, MariaDB, SQLite, and SQL Server — all with the same API, zero configuration switching.

  - icon: 🔗
    title: Full Relationship Support
    details: hasOne, hasMany, belongsTo, belongsToMany, and all polymorphic variants. Eager loading, pivot ops, morph maps.

  - icon: ⚡
    title: Fluent Query Builder
    details: 50+ methods including subqueries, raw expressions, aggregates, JSON columns, and nested transactions.

  - icon: 🏭
    title: Model Factories
    details: States, sequences, relationship factories, afterMaking / afterCreating hooks, and recycle() for seeding and testing.

  - icon: 🔒
    title: TypeScript-first
    details: Decorators, generics, and strict types throughout. No magic reflection — your IDE knows everything.
---

## Quick start

```bash
npm install @wrsouza/orion pg
```

```ts
import { ConnectionManager, Model, table, fillable, casts } from '@wrsouza/orion';

// Connect
ConnectionManager.addConnectionUrl('default', process.env.DATABASE_URL!);

// Define a model
@table('users')
@fillable(['name', 'email'])
@casts({ is_active: 'boolean', born_at: 'date' })
class User extends Model {
  declare id: number;
  declare name: string;
  declare email: string;
  declare is_active: boolean;
}

// Query
const users = await User.where('is_active', true).orderBy('name').paginate(15);
const alice = await User.create({ name: 'Alice', email: 'alice@example.com' });
const page  = await User.with('posts').paginate(20);
```
