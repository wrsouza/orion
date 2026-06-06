# Factories

- [Introduction](#introduction)
- [Defining a Factory](#defining-a-factory)
  - [Factory States](#factory-states)
  - [Factory Callbacks](#factory-callbacks)
- [Registering a Factory on a Model](#registering-a-factory-on-a-model)
- [Creating Models](#creating-models)
  - [make — Unsaved Instances](#make--unsaved-instances)
  - [create — Persisted Instances](#create--persisted-instances)
  - [Overriding Attributes](#overriding-attributes)
- [Sequences](#sequences)
- [Factory Relationships](#factory-relationships)
  - [Has Many](#has-many)
  - [Belongs To](#belongs-to)
  - [Many to Many](#many-to-many-with-hasmattached)
  - [Polymorphic](#polymorphic)
  - [Magic Methods](#magic-methods)
- [Recycling Existing Models](#recycling-existing-models)
- [Soft-Deleted Models](#soft-deleted-models)

---

## Introduction

Model factories let you define default attribute sets for testing and database seeding. Factories use a fluent API and support states, sequences, relationships, and lifecycle callbacks.

Orion factories do not depend on any specific faker library. Bring your own (`@faker-js/faker`, `chance`, etc.) and use it inside `definition()`.

---

## Defining a Factory

Extend `Factory<T>` and implement `definition()`:

```ts
import { Factory } from '@wrsouza/orion';
import { faker } from '@faker-js/faker';

class UserFactory extends Factory<User> {
  model = User;

  definition(): Record<string, unknown> {
    return {
      name:               faker.person.fullName(),
      email:              faker.internet.email(),
      email_verified_at:  new Date(),
      password:           'hashed-password',
      is_active:          true,
    };
  }
}
```

### Factory States

States are named methods that return `this.state({...})` with partial attribute overrides:

```ts
class UserFactory extends Factory<User> {
  model = User;

  definition(): Record<string, unknown> {
    return {
      name:     faker.person.fullName(),
      email:    faker.internet.email(),
      is_active: true,
    };
  }

  // State: suspended user
  suspended(): this {
    return this.state({ is_active: false, suspended_at: new Date() });
  }

  // State: unverified user
  unverified(): this {
    return this.state({ email_verified_at: null });
  }

  // State: admin
  admin(): this {
    return this.state({ role: 'admin', is_active: true });
  }
}

// Usage
const user = await User.factory().suspended().create();
const user = await User.factory().admin().create();
```

States can also register their own `afterMaking` / `afterCreating` callbacks:

```ts
vip(): this {
  return this.state({ tier: 'vip' })
    .afterCreating(async (user) => {
      await Subscription.create({ user_id: user.id, plan: 'premium' });
    });
}
```

### Factory Callbacks

Use `configure()` to register persistent `afterMaking` / `afterCreating` hooks that run for every instance produced by this factory:

```ts
class UserFactory extends Factory<User> {
  model = User;

  definition() {
    return { name: faker.person.fullName(), email: faker.internet.email() };
  }

  protected configure(): void {
    this.afterMaking((user) => {
      // Called after make() — user is not yet persisted
    });

    this.afterCreating(async (user) => {
      // Called after create() — user is in the database
      await Profile.create({ user_id: user.id, bio: '' });
    });
  }
}
```

Alternatively, chain them on use:

```ts
await User.factory()
  .afterCreating(async (user) => {
    await Profile.create({ user_id: user.id });
  })
  .create();
```

---

## Registering a Factory on a Model

Set the static `_factory` property on the model to link it to a factory:

```ts
@table('users')
class User extends Model {
  static _factory = UserFactory;
}

User.factory(); // returns new UserFactory()
```

---

## Creating Models

### make — Unsaved Instances

```ts
const user  = User.factory().make();
const users = User.factory().count(3).make();

// make() returns a plain instance (no DB interaction)
console.log(user.name); // 'Alice Smith'
console.log(user.id);   // undefined — not persisted
```

### create — Persisted Instances

```ts
const user  = await User.factory().create();
const users = await User.factory().count(3).create();

console.log(user.id);   // 1
console.log(user.wasRecentlyCreated); // true
```

### Overriding Attributes

Pass attribute overrides directly to `make()` or `create()`:

```ts
const user = await User.factory().create({ name: 'Alice', email: 'alice@example.com' });
```

Or via the fluent `state()` method:

```ts
const user = await User.factory()
  .state({ role: 'editor', is_active: false })
  .create();
```

---

## Sequences

`Sequence` cycles through a list of attribute sets as models are created:

```ts
import { Sequence } from '@wrsouza/orion';

// Alternates between two states
const users = await User.factory().count(4).sequence(
  { role: 'admin' },
  { role: 'editor' },
).create();
// user[0].role = 'admin'
// user[1].role = 'editor'
// user[2].role = 'admin'
// user[3].role = 'editor'

// Or with a constructor
const users = await User.factory()
  .count(10)
  .state(new Sequence({ status: 'active' }, { status: 'inactive' }))
  .create();
```

Use `$index` inside a closure-based sequence to derive values from position:

```ts
const users = await User.factory()
  .count(5)
  .state(new Sequence(
    (seq) => ({ name: `User ${seq.index + 1}`, email: `user${seq.index + 1}@example.com` })
  ))
  .create();
// User 1 / user1@example.com, User 2 / user2@example.com, ...
```

---

## Factory Relationships

### Has Many

Create a parent with related children using `has()`:

```ts
const user = await User.factory()
  .has(Post.factory().count(3))
  .create();
// Creates 1 user + 3 posts with user_id set automatically

// Explicit relationship name
const user = await User.factory()
  .has(Post.factory().count(3), 'posts')
  .create();

// Access parent from child state (closure receives the parent)
const user = await User.factory()
  .has(
    Post.factory().count(3).state((attrs, user) => ({
      title: `${user.name}'s Post`,
    }))
  )
  .create();
```

### Belongs To

Create children with a parent using `for()`:

```ts
const posts = await Post.factory()
  .count(3)
  .for(User.factory().state({ name: 'Alice' }))
  .create();

// Reuse an existing parent
const alice = await User.factory().create();
const posts = await Post.factory().count(3).for(alice).create();
```

### Many to Many with `hasAttached`

```ts
const user = await User.factory()
  .hasAttached(
    Role.factory().count(3),
    { approved: true }         // pivot attributes
  )
  .create();

// With per-model pivot attributes (array of objects)
const user = await User.factory()
  .hasAttached(Role.factory(), [
    { approved: true, priority: 1 },
    { approved: false, priority: 2 },
  ])
  .create();

// Reuse existing roles
const roles = await Role.factory().count(3).create();
await User.factory().hasAttached(roles, { approved: true }).create();
```

### Polymorphic

For morphable parent relationships, pass the relationship name explicitly to `for()`:

```ts
// 3 comments, each belonging to a Post via the commentable morphTo
const comments = await Comment.factory()
  .count(3)
  .for(Post.factory(), 'commentable')
  .create();
```

### Magic Methods

As a shorthand, Orion's factory Proxy resolves `has{Relation}()` and `for{Relation}()` dynamically:

```ts
// has{Relation}(factory, count?, attrs?)
const user = await User.factory().hasPosts(3).create();
const user = await User.factory().hasPosts(Post.factory().count(3)).create();
const user = await User.factory().hasPosts(3, { published: true }).create();

// for{Relation}(factory, attrs?)
const posts = await Post.factory().count(3).forUser({ name: 'Alice' }).create();
const posts = await Post.factory().count(3).forUser(User.factory()).create();
```

---

## Recycling Existing Models

When multiple factories would create duplicate related models, use `recycle()` to share a single instance:

```ts
// Without recycle — each ticket and each flight creates its own airline
await Ticket.factory().count(3).create();

// With recycle — all tickets and flights share the same airline
const airline = await Airline.factory().create();
await Ticket.factory().count(3).recycle(airline).create();
```

`recycle()` also accepts a collection — a random model from the collection is chosen each time:

```ts
const airlines = await Airline.factory().count(3).create();
await Ticket.factory().count(10).recycle(airlines).create();
```

---

## Soft-Deleted Models

The built-in `trashed()` state creates soft-deleted model instances:

```ts
const user = await User.factory().trashed().create();
// user.deleted_at is set to a past date
// The user exists in the DB but is soft-deleted
```

`trashed()` is available on any factory whose model uses the `SoftDeletes` mixin.
