# Soft Deletes

- [Introduction](#introduction)
- [Setup](#setup)
- [Soft Deleting a Model](#soft-deleting-a-model)
- [Restoring Models](#restoring-models)
- [Querying Soft-Deleted Models](#querying-soft-deleted-models)
- [Force Deleting](#force-deleting)
- [Quiet Operations](#quiet-operations)
- [Events](#events)
- [Soft Deletes in Relationships](#soft-deletes-in-relationships)

---

## Introduction

Soft deleting means setting a `deleted_at` timestamp on a row instead of physically removing it. Queries automatically exclude soft-deleted rows via a global scope. Deleted rows can be restored, audited, or permanently removed later.

---

## Setup

Apply the `SoftDeletes` mixin to your model:

```ts
import { Model, SoftDeletes, table, fillable } from '@wrsouza/orion';

@table('posts')
@fillable(['title', 'body'])
class Post extends SoftDeletes(Model) {
  declare id: number;
  declare title: string;
  declare body: string;
  declare deleted_at: Date | null;
}
```

Add `deleted_at` to the migration:

```ts
// In your migration's up():
table.softDeletes();        // adds deleted_at TIMESTAMP NULL
// or with timezone:
table.softDeletesTz();      // adds deleted_at TIMESTAMPTZ NULL
```

---

## Soft Deleting a Model

```ts
const post = await Post.findOrFail(1);

await post.delete();
// Sets deleted_at = NOW() and saves. Row stays in the database.
// Fires: deleting → deleted

post.trashed(); // true
post.deleted_at; // Date
```

The row is no longer returned by default queries:

```ts
await Post.find(1); // null — excluded by SoftDeleteScope
await Post.all();   // only non-deleted posts
```

---

## Restoring Models

```ts
const post = await Post.withTrashed().where('id', 1).firstOrFail();

await post.restore();
// Sets deleted_at = NULL
// Fires: restoring → restored

post.trashed(); // false
```

Restore many at once:

```ts
await Post.onlyTrashed().where('user_id', userId).restore();
```

---

## Querying Soft-Deleted Models

```ts
// Include soft-deleted rows
const all = await Post.withTrashed().get();
const one = await Post.withTrashed().where('id', 1).first();

// Only soft-deleted rows
const deleted = await Post.onlyTrashed().get();

// Check if a specific model instance is soft-deleted
post.trashed(); // boolean
```

---

## Force Deleting

Permanently remove a row, bypassing soft deletes:

```ts
await post.forceDelete();
// Physically removes the row from the database
// Fires: forceDeleting → forceDeleted

await Post.where('deleted_at', '<', cutoffDate).forceDelete();
// Bulk force delete (no per-model events)
```

Static convenience:

```ts
await Post.forceDestroy(1, 2, 3);
// Force-deletes these IDs, firing forceDeleting/forceDeleted per model
```

---

## Quiet Operations

Perform soft-delete operations without firing model events:

```ts
await post.deleteQuietly();   // soft delete, no events
await post.restoreQuietly();  // restore, no events
await post.forceDeleteQuietly(); // force delete, no events
```

---

## Events

Soft-delete operations fire specific events:

| Operation | Events fired |
|-----------|-------------|
| `delete()` | `deleting` → `deleted` |
| `restore()` | `restoring` → `restored` |
| `forceDelete()` | `forceDeleting` → `forceDeleted` |

Listen to restore events:

```ts
Post.restoring((post) => {
  console.log(`Post ${post.id} is being restored`);
});

Post.restored((post) => {
  // Re-publish to search index
  searchIndex.upsert(post.toArray());
});
```

Cancel a restore by returning `false`:

```ts
Post.restoring((post) => {
  if (!currentUser.canRestore(post)) return false;
});
```

---

## Soft Deletes in Relationships

Soft-deleted models are automatically excluded from relationship queries. If you need to include them, use `withTrashed()` inside a constrained eager load:

```ts
// Comments relation excludes soft-deleted comments by default
const post = await Post.with('comments').first();

// Include soft-deleted comments
const post = await Post.with({
  comments: (q) => q.withTrashed(),
}).first();

// Only soft-deleted comments
const post = await Post.with({
  comments: (q) => q.onlyTrashed(),
}).first();
```
