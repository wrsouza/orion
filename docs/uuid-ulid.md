# UUID / ULID

- [Introduction](#introduction)
- [HasUuids](#hasuuids)
  - [Multiple UUID Columns](#multiple-uuid-columns)
  - [Custom UUID Generator](#custom-uuid-generator)
- [HasUlids](#hasulids)
  - [Custom ULID Generator](#custom-ulid-generator)
- [Schema Setup](#schema-setup)
- [Relationships with UUID / ULID Keys](#relationships-with-uuid--ulid-keys)

---

## Introduction

By default, Orion assumes an auto-incrementing integer primary key. Use the `@uuid()` decorator or the `HasUlids` mixin to automatically generate a UUID or ULID value for the `id` column before INSERT — no database trigger or sequence required.

---

## UUID — `@uuid()`

Apply `@uuid()` to the primary key field to generate a random UUID v4 automatically:

```ts
import { Model, table, uuid } from '@wrsouza/orion';

@table('posts')
class Post extends Model {
  @uuid()
  declare id: string;     // UUID v4, auto-generated on create

  declare title: string;
  declare body: string;
}

const post = await Post.create({ title: 'Hello World', body: '...' });
console.log(post.id); // 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
```

`@uuid()` sets `incrementing: false` and `keyType: 'string'` automatically — no `@table` config needed.

### Multiple UUID Columns

Apply `@uuid()` to any additional columns that should also receive a generated UUID:

```ts
@table('invitations')
class Invitation extends Model {
  @uuid()
  declare id: string;

  @uuid()
  declare token: string;   // also gets a UUID
}

const invite = await Invitation.create({ email: 'alice@example.com' });
console.log(invite.id);    // UUID
console.log(invite.token); // different UUID
```

---

## HasUlids

Apply `HasUlids` to generate a ULID (Universally Unique Lexicographically Sortable Identifier) as the primary key. ULIDs are 26-character base32 strings and sort chronologically, making them index-friendly.

`HasUlids` has no external dependencies — it uses `crypto.getRandomValues()` from the Node.js built-in `crypto` module.

```ts
import { Model, HasUlids, table } from '@wrsouza/orion';

@table('orders')
class Order extends HasUlids(Model) {
  declare id: string;    // ULID, auto-generated on create
  declare total: number;
  declare status: string;
}

const order = await Order.create({ total: 9999, status: 'pending' });
console.log(order.id); // '01HZ8P4KCJFQ9T6D3RQNV5W7E'
```

Like `HasUuids`, this sets `incrementing = false` and `keyType = 'string'` automatically.

### Custom ULID Generator

```ts
import { ulid } from 'ulid'; // external library

@table('sessions')
class Session extends HasUlids(Model) {
  newUniqueId(): string {
    return ulid(); // use the 'ulid' npm package instead
  }
}
```

---

## Schema Setup

For UUID primary keys:

```ts
await Schema.create('posts', (table) => {
  table.uuid('id').primary();         // UUID PK — no default, Orion fills it
  table.string('title');
  table.timestamps();
});
```

For ULID primary keys:

```ts
await Schema.create('orders', (table) => {
  table.ulid('id').primary();        // ULID — CHAR(26)
  table.decimal('total', 10, 2);
  table.timestamps();
});
```

For foreign keys pointing to a UUID model:

```ts
await Schema.create('comments', (table) => {
  table.id();                         // integer PK for Comment
  table.foreignUuid('post_id')
    .references('id').on('posts')
    .onDelete('CASCADE');
  table.timestamps();
});
```

---

## Relationships with UUID / ULID Keys

Relationships work identically — Orion infers the correct key types:

```ts
@table('posts')
class Post extends Model {
  @uuid()
  declare id: string;

  comments(): HasMany<Comment> {
    return this.hasMany(Comment);
    // FK inferred: comments.post_id (CHAR(36) / UUID column in DB)
  }
}

@table('comments')
class Comment extends Model {
  post(): BelongsTo<Post> {
    return this.belongsTo(Post);
  }
}

const comments = await post.comments().get();
```

If your foreign key column type doesn't match, pass the keys explicitly:

```ts
this.hasMany(Comment, 'post_uuid', 'id')
```
