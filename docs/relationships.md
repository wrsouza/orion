# Relationships

- [Introduction](#introduction)
- [Defining Relationships](#defining-relationships)
- [One to One](#one-to-one)
- [One to Many](#one-to-many)
- [Many to One (belongsTo)](#many-to-one-belongsto)
- [Many to Many](#many-to-many)
  - [Pivot Table Data](#pivot-table-data)
  - [Filtering via Pivot Columns](#filtering-via-pivot-columns)
  - [Ordering via Pivot](#ordering-via-pivot)
  - [Pivot Operations](#pivot-operations)
- [Has One Through](#has-one-through)
- [Has Many Through](#has-many-through)
- [Polymorphic Relationships](#polymorphic-relationships)
  - [One to One Polymorphic](#one-to-one-polymorphic)
  - [One to Many Polymorphic](#one-to-many-polymorphic)
  - [Many to Many Polymorphic](#many-to-many-polymorphic)
  - [MorphMap](#morphmap)
- [One of Many](#one-of-many)
- [Querying Relationships](#querying-relationships)
  - [Existence Checks](#existence-checks)
  - [Inline Constraints (whereRelation)](#inline-constraints-whererelation)
  - [Polymorphic Existence](#polymorphic-existence)
  - [whereAttachedTo / whereMorphedTo](#whereattachedto--wheremorphedto)
  - [whereBelongsTo](#wherebelongsto)
- [Aggregating Related Models](#aggregating-related-models)
- [Eager Loading](#eager-loading)
- [Lazy Loading Guard](#lazy-loading-guard)
- [Writing via Relationships](#writing-via-relationships)
- [Touching Parent Timestamps](#touching-parent-timestamps)
- [Scoped Relationships](#scoped-relationships)
- [Dynamic Relationships](#dynamic-relationships)

---

## Introduction

Relationships are defined as methods on a model that return a `Relation` object. Orion infers foreign key names from class names by convention (`hasMany(Post)` â†’ `post_id`, `belongsToMany(Role)` â†’ pivot table `role_user`). All keys can be overridden explicitly.

---

## Defining Relationships

```ts
import { Model, HasOne, HasMany, BelongsTo, BelongsToMany, table, fillable } from '@wrsouza/orion';

@table('users')
@fillable(['name', 'email'])
class User extends Model {
  // One-to-one
  profile(): HasOne<Profile> {
    return this.hasOne(Profile);
  }

  // One-to-many
  posts(): HasMany<Post> {
    return this.hasMany(Post);
  }

  // Many-to-many
  roles(): BelongsToMany<Role> {
    return this.belongsToMany(Role);
  }
}

@table('posts')
class Post extends Model {
  // Many-to-one (inverse of hasMany)
  author(): BelongsTo<User> {
    return this.belongsTo(User);
  }
}
```

To load a relationship:

```ts
const user = await User.findOrFail(1);

// Returns the relation's ModelCollection/Model directly
const posts   = await user.posts().get();
const profile = await user.profile().getResults();
```

---

## One to One

```ts
class User extends Model {
  profile(): HasOne<Profile> {
    return this.hasOne(Profile);
    // Orion infers: profile.user_id â†’ users.id
  }
}

class Profile extends Model {
  user(): BelongsTo<User> {
    return this.belongsTo(User);
    // Orion infers: profiles.user_id â†’ users.id
  }
}
```

Explicit keys:

```ts
this.hasOne(Profile, 'fk_user', 'local_key')
this.belongsTo(User, 'fk_column', 'owner_key')
```

Usage:

```ts
const profile = await user.profile().getResults();
const user    = await profile.user().getResults();
```

---

## One to Many

```ts
class Post extends Model {
  comments(): HasMany<Comment> {
    return this.hasMany(Comment);
    // Orion infers: comments.post_id â†’ posts.id
  }
}
```

```ts
const comments = await post.comments().get();
const recent   = await post.comments().orderBy('created_at', 'desc').limit(5).get();
```

`chaperone()` automatically sets the parent reference (`_relations['post']`) on each loaded child, saving an extra query when you access the parent from the child:

```ts
comments(): HasMany<Comment> {
  return this.hasMany(Comment).chaperone();
}
```

---

## Many to One (belongsTo)

```ts
class Comment extends Model {
  post(): BelongsTo<Post> {
    return this.belongsTo(Post);
  }
}
```

**`withDefault()`** returns a default model instance when the foreign key is null, preventing `null` errors:

```ts
class Post extends Model {
  author(): BelongsTo<User> {
    return this.belongsTo(User).withDefault({ name: 'Anonymous' });
  }
  // Closures work too:
  editor(): BelongsTo<User> {
    return this.belongsTo(User).withDefault((user, post) => {
      user._attributes.name = `${post.title} author`;
    });
  }
}
```

---

## Many to Many

```ts
class User extends Model {
  roles(): BelongsToMany<Role> {
    return this.belongsToMany(Role);
    // Pivot table inferred: role_user (sorted alphabetically)
    // Orion infers: role_user.user_id, role_user.role_id
  }
}

class Role extends Model {
  users(): BelongsToMany<User> {
    return this.belongsToMany(User); // inverse
  }
}
```

Explicit keys:

```ts
this.belongsToMany(Role, 'role_user', 'user_id', 'role_id')
```

### Pivot Table Data

Include extra pivot columns and access them on the related model:

```ts
class User extends Model {
  roles(): BelongsToMany<Role> {
    return this.belongsToMany(Role)
      .withPivot('approved', 'assigned_at')
      .withTimestamps()          // include pivot created_at/updated_at
      .as('membership');         // access pivot as role.membership instead of role.pivot
  }
}

const roles = await user.roles().get();
const pivot = roles[0].getRelation<PivotRecord>('membership');

pivot.get('approved');     // true
pivot.get('assigned_at');  // '2024-06-01T10:00:00.000Z'
```

Set a fixed pivot value applied on every `attach`:

```ts
roles(): BelongsToMany<Role> {
  return this.belongsToMany(Role).withPivotValue('approved', true);
}
// Every attach() call automatically sets approved = true
```

### Filtering via Pivot Columns

```ts
user.roles().wherePivot('approved', true)
user.roles().wherePivotIn('priority', [1, 2])
user.roles().wherePivotNotIn('priority', [3])
user.roles().wherePivotBetween('created_at', ['2024-01-01', '2024-12-31'])
user.roles().wherePivotNotBetween('expires_at', [now, future])
user.roles().wherePivotNull('expires_at')
user.roles().wherePivotNotNull('approved_at')
```

### Ordering via Pivot

```ts
user.roles().orderByPivot('assigned_at').get()
user.roles().orderByPivotDesc('assigned_at').get()
```

### Pivot Operations

```ts
// Attach
await user.roles().attach(1);
await user.roles().attach([1, 2, 3]);
await user.roles().attach([1, 2], { approved: true });

// Detach
await user.roles().detach(1);
await user.roles().detach([1, 2]);
await user.roles().detach(); // detach all

// Sync â€” detach any not in the list, attach any missing
await user.roles().sync([1, 2, 3]);
await user.roles().sync([1, 2], false); // don't detach missing (syncWithoutDetaching)
await user.roles().syncWithoutDetaching([1, 2]);
await user.roles().syncWithPivotValues([1, 2], { approved: true });

// Toggle â€” attach if detached, detach if attached
await user.roles().toggle([1, 2, 3]);

// Update an existing pivot row
await user.roles().updateExistingPivot(1, { approved: false });
```

---

## Has One Through

Provides access to a distant relation through an intermediate model.

```ts
// Mechanic â†’ Car â†’ Owner
class Mechanic extends Model {
  carOwner(): HasOneThrough<Owner> {
    return this.hasOneThrough(
      Owner,    // final model
      Car,      // intermediate model
      'mechanic_id', // FK on intermediate (Car.mechanic_id)
      'car_id',      // FK on final (Owner.car_id)
      'id',          // local key on Mechanic
      'id'           // local key on Car
    );
  }
}
```

---

## Has Many Through

```ts
// Country â†’ User â†’ Post
class Country extends Model {
  posts(): HasManyThrough<Post> {
    return this.hasManyThrough(Post, User);
    // Infers: users.country_id, posts.user_id
  }
}

const posts = await country.posts().get();
```

---

## Polymorphic Relationships

### One to One Polymorphic

A single model belongs to more than one other model using a single association.

```ts
// Image can belong to Post or Video
class Post extends Model {
  image(): MorphOne<Image> {
    return this.morphOne(Image, 'imageable');
    // â†’ images.imageable_id + images.imageable_type
  }
}

class Video extends Model {
  image(): MorphOne<Image> {
    return this.morphOne(Image, 'imageable');
  }
}

class Image extends Model {
  imageable(): MorphTo {
    return this.morphTo('imageable');
  }
}
```

### One to Many Polymorphic

```ts
class Post extends Model {
  comments(): MorphMany<Comment> {
    return this.morphMany(Comment, 'commentable');
  }
}

class Video extends Model {
  comments(): MorphMany<Comment> {
    return this.morphMany(Comment, 'commentable');
  }
}

class Comment extends Model {
  commentable(): MorphTo {
    return this.morphTo('commentable');
  }
}

// Usage
const comments = await post.comments().get();
const parent   = await comment.commentable().getResults(); // Post | Video
```

### Many to Many Polymorphic

```ts
class Post extends Model {
  tags(): MorphToMany<Tag> {
    return this.morphToMany(Tag, 'taggable');
  }
}

class Video extends Model {
  tags(): MorphToMany<Tag> {
    return this.morphToMany(Tag, 'taggable');
  }
}

class Tag extends Model {
  posts(): MorphedByMany<Post> {
    return this.morphedByMany(Post, 'taggable');
  }
  videos(): MorphedByMany<Video> {
    return this.morphedByMany(Video, 'taggable');
  }
}
```

### MorphMap

By default, Orion stores the full class name in the `_type` column. Use `MorphMap` to store shorter aliases:

```ts
import { MorphMap } from '@wrsouza/orion';

MorphMap.register({
  post:  Post,
  video: Video,
});

// Retrieve a registered class from its alias
const cls = MorphMap.getClass('post'); // Post constructor

// Retrieve the alias for a model instance
const alias = MorphMap.getAlias(post); // 'post'
```

Register globally at bootstrap before any polymorphic relations are used.

---

## One of Many

`latestOfMany`, `oldestOfMany`, and `ofMany` turn a `hasMany` into a `hasOne` that returns a specific record â€” the latest, oldest, or one matching a custom criteria.

```ts
class User extends Model {
  latestOrder():  HasOne<Order> { return this.hasOne(Order).latestOfMany(); }
  oldestOrder():  HasOne<Order> { return this.hasOne(Order).oldestOfMany(); }
  largestOrder(): HasOne<Order> { return this.hasOne(Order).ofMany('total', 'max'); }

  // Multi-column criteria with a constraint
  currentPrice(): HasOne<Price> {
    return this.hasOne(Price).ofMany(
      { published_at: 'max', id: 'max' },
      (q) => q.where('published_at', '<', new Date())
    );
  }
}
```

These relationships can be eager-loaded like any other:

```ts
const users = await User.with('latestOrder').get();
```

---

## Querying Relationships

### Existence Checks

```ts
// Posts that have at least one comment
await Post.has('comments').get();

// Posts with 3 or more comments
await Post.has('comments', '>=', 3).get();

// Nested â€” posts that have comments with at least one image
await Post.has('comments.images').get();

// With constraint
await Post.whereHas('comments', (q) => {
  q.where('approved', true);
}).get();

// With constraint + minimum count
await Post.whereHas('comments', (q) => {
  q.where('approved', true);
}, '>=', 5).get();

// Absence
await Post.doesntHave('comments').get();
await Post.whereDoesntHave('comments', (q) => q.where('spam', true)).get();

// OR variants
await Post.has('comments').orHas('likes').get();
await Post.whereHas('comments').orWhereHas('tags', (q) => q.where('featured', true)).get();
await Post.doesntHave('comments').orDoesntHave('tags').get();
await Post.whereDoesntHave('comments').orWhereDoesntHave('spam_reports').get();
```

### Inline Constraints (whereRelation)

A shorthand for single-column constraints on a relation â€” no need for a full `whereHas` closure:

```ts
await Post.whereRelation('comments', 'approved', true).get();
await Post.whereRelation('comments', 'created_at', '>=', lastHour).get();
await Post.orWhereRelation('comments', 'featured', true).get();
```

For polymorphic relations:

```ts
await Activity.whereMorphRelation('subject', [Post, Video], 'published', true).get();
await Activity.orWhereMorphRelation('subject', '*', 'active', true).get();
```

### Polymorphic Existence

```ts
// Comments attached to any morphable type
await Comment.whereHasMorph('commentable', '*').get();

// Comments attached to Post or Video
await Comment.whereHasMorph('commentable', [Post, Video]).get();

// Comments on a published Post
await Comment.whereHasMorph('commentable', [Post], (q) => {
  q.where('published', true);
}).get();

// Type-aware constraint â€” different filter per type
await Comment.whereHasMorph('commentable', [Post, Video], (q, type) => {
  const col = type === 'App\\Models\\Post' ? 'content' : 'title';
  q.where(col, 'like', 'code%');
}).get();

// Absence
await Comment.whereDoesntHaveMorph('commentable', [Post]).get();
```

### whereAttachedTo / whereMorphedTo

```ts
// Roles attached to a specific user (via a many-to-many pivot)
await Role.whereAttachedTo(user).get();
await Role.orWhereAttachedTo(anotherUser).get();

// Comments for a specific morphable parent
await Comment.whereMorphedTo('commentable', post).get();
await Comment.whereNotMorphedTo('commentable', post).get();
await Comment.orWhereMorphedTo('commentable', video).get();
```

### whereBelongsTo

A convenient way to filter by a parent model without manually specifying the foreign key:

```ts
const posts = await Post.whereBelongsTo(user).get();
// Equivalent to: Post.where('user_id', user.id).get()

// With a collection of users
const users = await User.where('vip', true).get();
const posts = await Post.whereBelongsTo(users).get();

// Explicit relationship name (when the relation method name doesn't match convention)
const posts = await Post.whereBelongsTo(user, 'author').get();

// OR variant
await Post.whereBelongsTo(alice).orWhereBelongsTo(bob).get();
```

---

## Aggregating Related Models

Add aggregate values as virtual columns on each result row:

```ts
// Count
const posts = await Post.withCount('comments').get();
post.getRelation<number>('comments_count'); // 5

// Constrained count
const posts = await Post.withCount({
  comments: (q) => q.where('approved', true),
}).get();
post.getRelation<number>('comments_count');

// Aliased count
const posts = await Post
  .withCount('comments as total_comments')
  .withCount({ comments: [(q) => q.where('approved', false), 'pending_comments'] })
  .get();

// Other aggregates
await Post.withSum('comments', 'votes').get();
post.getRelation<number>('comments_sum_votes');

await Post.withMin('comments', 'votes').get();
await Post.withMax('comments', 'votes').get();
await Post.withAvg('reviews', 'rating').get();

// Boolean â€” has any related?
await Post.withExists('comments').get();
post.getRelation<boolean>('comments_exists');
```

**Load on instances:**

```ts
await user.loadCount('posts');
await user.loadSum('orders', 'amount');
await user.loadMin('orders', 'amount');
await user.loadMax('orders', 'amount');
await user.loadAvg('reviews', 'rating');
await user.loadExists('orders');

user.getRelation<number>('orders_sum_amount');
```

**Load on collections:**

```ts
const users = await User.get();
await users.loadCount('posts');
await users.loadSum('orders', 'amount');
```

**Polymorphic morph counts:**

```ts
const activities = await ActivityFeed.with({
  parentable: (q) => {
    q.morphWithCount({
      Photo: ['tags'],
      Post:  ['comments'],
    });
  },
}).get();

// Deferred
const activities = await ActivityFeed.with('parentable').get();
await activities.loadMorphCount('parentable', {
  Photo: ['tags'],
  Post:  ['comments'],
});
```

---

## Eager Loading

Eager loading prevents N+1 queries by loading all related records in one extra query per relation.

```ts
// Single relation
const posts = await Post.with('author').get();

// Multiple relations
const posts = await Post.with(['author', 'comments']).get();

// Nested
const posts = await Post.with('comments.author').get();

// Constrained
const posts = await Post.with({
  comments: (q) => q.where('approved', true).latest(),
}).get();

// Mixed: constrained and unconstrained in one call
const posts = await Post.with([
  'author',
  { comments: (q) => q.where('approved', true) },
]).get();
```

Load on existing instances:

```ts
const user = await User.findOrFail(1);

await user.load('posts');
await user.load(['posts', 'roles']);
await user.load({ posts: (q) => q.where('published', true) });

// Only if not already loaded
await user.loadMissing('posts');
```

---

## Lazy Loading Guard

Prevent accidental N+1 queries by throwing when a relation is accessed without eager loading:

```ts
Model.preventLazyLoading();                                   // enable globally
Model.preventLazyLoading(false);                              // disable
Model.preventLazyLoading(process.env.NODE_ENV !== 'production');

// When triggered, throws:
// LazyLoadingViolationError: Attempted to lazy load [posts] on [User] without eager loading.
```

---

## Writing via Relationships

### HasOne / HasMany

```ts
// create â€” new related model, auto-sets FK, saves immediately
const comment = await post.comments().create({ body: 'Great post!' });

// createMany
await post.comments().createMany([
  { body: 'First comment' },
  { body: 'Second comment' },
]);

// save â€” associate and save an existing model
const c = new Comment();
c.body = 'Hello';
await post.comments().save(c);

// saveMany
await post.comments().saveMany([c1, c2]);

// firstOrCreate â€” find or create within the relation
const comment = await post.comments().firstOrCreate(
  { body: 'Pinned comment' },
  { pinned: true }
);

// updateOrCreate
await post.comments().updateOrCreate(
  { body: 'Welcome message' },
  { pinned: true, approved: true }
);
```

### BelongsTo

```ts
// associate â€” set FK and save
await comment.post().associate(post);
comment._attributes; // { ..., post_id: 1 }
await comment.save();

// dissociate â€” set FK to null
comment.post().dissociate();
await comment.save();
```

---

## Touching Parent Timestamps

When a child model is saved, optionally update the parent's `updated_at`:

```ts
@table('comments')
class Comment extends Model {
  protected _touches = ['post'];

  post(): BelongsTo<Post> {
    return this.belongsTo(Post);
  }
}

await comment.save();
// â†’ also executes UPDATE posts SET updated_at = NOW() WHERE id = ?
```

Manual touch:

```ts
await comment.touch();         // update comment's own updated_at
await comment.touch('post');   // update parent post's updated_at
```

---

## Scoped Relationships

Pre-populate attributes or conditions on a relation â€” creating through it automatically sets those values:

```ts
class Post extends Model {
  // pre-set approved = true â€” always sets this when creating through this relation
  approvedComments(): HasMany<Comment> {
    return this.hasMany(Comment).withAttributes({ approved: true });
  }

  // as query condition only (don't set on new models)
  recentComments(): HasMany<Comment> {
    return this.hasMany(Comment).withAttributes(
      { created_at: lastWeek },
      false  // asConditions = false â†’ don't apply on create
    );
  }
}

// Creating auto-sets approved = true
const comment = await post.approvedComments().create({ body: 'Nice post!' });
// comment.approved === true
```

---

## Dynamic Relationships

Register a relation at runtime â€” useful for plugins or decoupled modules:

```ts
User.resolveRelationUsing('latestOrder', (user) =>
  user.hasOne(Order).latest()
);

User.resolveRelationUsing('activeSubscription', (user) =>
  user.hasOne(Subscription).where('active', true)
);

// Access exactly like a normal relation method
const order = await user.latestOrder().getResults();
```
