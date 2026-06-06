# Collections

- [Introduction](#introduction)
- [Collection\<T\>](#collectiont)
  - [Available Methods](#available-methods)
- [ModelCollection\<T\>](#modelcollectiont)
  - [PK-Based Methods](#pk-based-methods)
  - [Database Operations](#database-operations)
  - [Aggregate Loading](#aggregate-loading)
  - [Serialization Helpers](#serialization-helpers)
- [Custom Collections](#custom-collections)

---

## Introduction

All multi-row results returned by Orion â€” from `Model.get()`, relation queries, and `Model.all()` â€” are instances of `ModelCollection<T>`. This class extends the base `Collection<T>` with model-aware methods for PK lookups, eager loading, and batch database operations.

---

## Collection\<T\>

`Collection<T>` is a typed wrapper around a plain array. It is the base class for `ModelCollection<T>` and is also returned by some raw query operations.

### Available Methods

```ts
// Inspection
col.all()             // T[]
col.count()           // number
col.isEmpty()         // boolean
col.isNotEmpty()      // boolean
col.contains(item)    // boolean (by value or predicate)
col.first()           // T | undefined
col.first(fn)         // T | undefined â€” first matching predicate
col.last()            // T | undefined
col.last(fn)          // T | undefined

// Retrieval
col.find(fn)          // T | undefined
col.get(index)        // T | undefined

// Transformation
col.map(fn)           // Collection<U>
col.flatMap(fn)       // Collection<U>
col.filter(fn)        // Collection<T>
col.reject(fn)        // Collection<T> â€” inverse of filter
col.each(fn)          // void â€” iterate, returning this for chaining
col.reduce(fn, init)  // accumulator result
col.pluck(key)        // Collection<V> â€” values for a given property
col.groupBy(key)      // Record<string, Collection<T>>
col.keyBy(key)        // Record<string, T>
col.chunk(size)       // Collection<Collection<T>>
col.flatten()         // Collection<unknown>
col.unique(key?)      // Collection<T>
col.reverse()         // Collection<T>
col.sort(compareFn?)  // Collection<T>
col.sortBy(key)       // Collection<T>
col.sortByDesc(key)   // Collection<T>

// Merging
col.push(...items)    // Collection<T>
col.merge(other)      // Collection<T>
col.concat(other)     // Collection<T>
col.prepend(item)     // Collection<T>
col.append(item)      // Collection<T> â€” add to end (non-model version)

// Slicing
col.slice(start, end?)       // Collection<T>
col.take(n)                  // Collection<T> â€” first N items
col.skip(n)                  // Collection<T> â€” skip first N
col.forPage(page, perPage)   // Collection<T>

// Aggregates
col.sum(key)     // number
col.avg(key)     // number
col.min(key)     // number
col.max(key)     // number

// Serialization
col.toArray()    // T[]
col.toJSON()     // string
```

---

## ModelCollection\<T\>

`ModelCollection<T extends Model>` is returned by all `ModelBuilder.get()` calls and most relation queries. It adds model-specific methods on top of `Collection<T>`.

### PK-Based Methods

```ts
// Find by primary key â€” returns the model or undefined
const user = users.findByKey(1);

// Find or throw â€” throws ModelNotFoundException if missing
const user = users.findOrFail(1);

// All primary keys as an array
const ids = users.modelKeys(); // [1, 2, 3, 4, 5]

// Exclude by PK
const others = users.except([1, 2]);

// Include only by PK
const selected = users.only([3, 4]);

// Models present in this collection but NOT in another (compared by PK)
const diff = users.diff(otherUsers);

// Models present in BOTH collections (compared by PK)
const common = users.intersect(activeUsers);

// Check if a PK or model instance is in the collection
users.contains(1);
users.contains(someUser);

// Deduplicate by PK
const unique = users.unique();

// Split into two groups â€” [matching, notMatching]
const [admins, regular] = users.partition((u) => u._attributes.role === 'admin');
```

### Database Operations

```ts
// Re-fetch all models from the database â€” returns a new ModelCollection
const freshUsers = await users.fresh();

// Re-fetch with eager-loaded relationships
const freshUsers = await users.fresh('posts');
const freshUsers = await users.fresh(['posts', 'roles']);

// Eager-load a relationship onto the existing instances (in-place)
await users.load('posts');
await users.load(['posts', 'roles']);
await users.load({ posts: (q) => q.where('published', true) });

// Only load if not already loaded
await users.loadMissing('posts');
await users.loadMissing(['posts', 'roles']);

// Build a ModelBuilder with WHERE id IN (...) for these models
const builder = users.toQuery();
await users.toQuery().update({ status: 'archived' });
```

### Aggregate Loading

```ts
await users.loadCount('posts');
await users.loadCount({ posts: (q) => q.where('published', true) });

await users.loadSum('orders', 'amount');
await users.loadMin('orders', 'amount');
await users.loadMax('orders', 'amount');
await users.loadAvg('reviews', 'rating');
await users.loadExists('orders');

// Access the loaded value on each model
for (const user of users) {
  user.getRelation<number>('posts_count');
  user.getRelation<number>('orders_sum_amount');
}
```

### Serialization Helpers

These methods delegate to each model in the collection and return a new `ModelCollection` with the overrides applied:

```ts
// Visibility
users.makeVisible(['phone']);
users.makeHidden(['email', 'password']);
users.setVisible(['id', 'name', 'email']);   // replace entire visible list
users.setHidden(['password', 'token']);       // replace entire hidden list
users.mergeVisible(['phone']);                // add to current visible list
users.mergeHidden(['secret']);               // add to current hidden list

// Appended accessors
users.append('full_name');
users.append(['full_name', 'avatar_url']);
users.setAppends(['full_name']);
users.withoutAppends();

// Resource conversion (requires @UseResourceCollection on the model)
users.toResourceCollection();
```

---

## Custom Collections

You can bind a custom collection class to a model using the `@CollectedBy` decorator or by overriding `newCollection()`. Every call that would normally return `ModelCollection<User>` will return your custom class instead.

**With decorator:**

```ts
import { ModelCollection } from '@wrsouza/orion';

class UserCollection extends ModelCollection<User> {
  admins(): UserCollection {
    return this.filter((u) => u._attributes.role === 'admin') as UserCollection;
  }

  suspend(): Promise<void>[] {
    return this.map((u) => u.update({ suspended: true })).all();
  }
}
```

```ts
import { CollectedBy } from '@wrsouza/orion';  // planned â€” see gap audit

@CollectedBy(UserCollection)
@table('users')
class User extends Model {}

const users = await User.all(); // UserCollection<User>
users.admins().count();
```

**With `newCollection()` override:**

```ts
@table('users')
class User extends Model {
  static newCollection(models: User[] = []): UserCollection {
    return new UserCollection(models);
  }
}
```
