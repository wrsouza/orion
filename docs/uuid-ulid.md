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

By default, Orion assumes an auto-incrementing integer primary key. The `HasUuids` and `HasUlids` mixins automatically generate a UUID or ULID value for the `id` column (and optionally other columns) before INSERT — no database trigger or sequence required.

---

## HasUuids

Apply `HasUuids` to generate a random UUID v4 as the primary key:

```ts
import { Model, HasUuids, table, fillable } from 'orion';

@table('posts')
@fillable(['title', 'body'])
class Post extends HasUuids(Model) {
  declare id: string;     // UUID string, auto-generated on create
  declare title: string;
  declare body: string;
}

const post = await Post.create({ title: 'Hello World', body: '...' });
console.log(post.id); // 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
```

The model's `incrementing` flag is set to `false` and `keyType` to `'string'` automatically.

### Multiple UUID Columns

Override `uniqueIds()` to generate UUIDs for additional columns:

```ts
@table('invitations')
class Invitation extends HasUuids(Model) {
  declare id: string;
  declare token: string;   // also gets a UUID

  uniqueIds(): string[] {
    return ['id', 'token'];
  }
}

const invite = await Invitation.create({ email: 'alice@example.com' });
console.log(invite.id);    // UUID
console.log(invite.token); // different UUID
```

### Custom UUID Generator

Override `newUniqueId()` to use a different generator — for example, UUID v7 (time-sortable):

```ts
import { v7 as uuidv7 } from 'uuid';

@table('events')
class Event extends HasUuids(Model) {
  newUniqueId(): string {
    return uuidv7(); // time-sortable UUID
  }
}
```

---

## HasUlids

Apply `HasUlids` to generate a ULID (Universally Unique Lexicographically Sortable Identifier) as the primary key. ULIDs are 26-character base32 strings and sort chronologically, making them index-friendly.

`HasUlids` has no external dependencies — it uses `crypto.getRandomValues()` from the Node.js built-in `crypto` module.

```ts
import { Model, HasUlids, table, fillable } from 'orion';

@table('orders')
@fillable(['total', 'status'])
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
class Post extends HasUuids(Model) {
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
