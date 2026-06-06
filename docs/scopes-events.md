# Scopes & Events

- [Query Scopes](#query-scopes)
  - [Global Scopes](#global-scopes)
  - [Removing Global Scopes](#removing-global-scopes)
  - [Local Scopes](#local-scopes)
  - [Local Scopes with Parameters](#local-scopes-with-parameters)
- [Model Events](#model-events)
  - [Event Reference](#event-reference)
  - [Static Hooks](#static-hooks)
  - [Cancelling Events](#cancelling-events)
- [Observers](#observers)
  - [Defining an Observer](#defining-an-observer)
  - [Registering Observers](#registering-observers)
  - [The @observedBy Decorator](#the-observedby-decorator)
- [Quiet Operations](#quiet-operations)
- [withoutEvents](#withoutevents)

---

## Query Scopes

### Global Scopes

Global scopes automatically add constraints to every query for a model. They are useful for multi-tenancy, soft deletes, or any cross-cutting filter.

Implement the `Scope` interface:

```ts
import { Scope, ModelBuilder } from '@wrsouza/orion';

class ActiveScope implements Scope {
  apply(builder: ModelBuilder<any>): void {
    builder.where('is_active', true);
  }
}

class TenantScope implements Scope {
  constructor(private tenantId: number) {}

  apply(builder: ModelBuilder<any>): void {
    builder.where('tenant_id', this.tenantId);
  }
}
```

Register with `@scopedBy`:

```ts
import { Model, table, scopedBy } from '@wrsouza/orion';

@table('users')
@scopedBy([ActiveScope])
class User extends Model {}

// Every query now has WHERE is_active = true applied automatically
const users = await User.all();
```

### Removing Global Scopes

```ts
// Remove one scope by class name
await User.withoutGlobalScope('ActiveScope').get();

// Remove multiple scopes
await User.withoutGlobalScopes(['ActiveScope', 'TenantScope']).get();

// Remove all global scopes for this query
await User.withoutGlobalScopes().get();
```

### Local Scopes

Local scopes are reusable query snippets you chain onto `Model.query()`. Decorate a method with `@scope`:

```ts
import { Model, table, scope, ModelBuilder } from '@wrsouza/orion';

@table('users')
class User extends Model {
  @scope
  popular(builder: ModelBuilder<User>): void {
    builder.where('votes', '>', 100);
  }

  @scope
  active(builder: ModelBuilder<User>): void {
    builder.where('is_active', true);
  }

  @scope
  verified(builder: ModelBuilder<User>): void {
    builder.whereNotNull('email_verified_at');
  }
}

// Chain scopes fluently
const users = await (User.query() as any)
  .popular()
  .active()
  .orderBy('name')
  .get();
```

> **TypeScript note:** Scope methods are resolved via a runtime `Proxy` on the builder. To keep TypeScript happy, either cast to `any` or augment the type:
> ```ts
> interface UserBuilder extends ModelBuilder<User> {
>   popular(): this;
>   active(): this;
>   verified(): this;
> }
> const users = await (User.query() as UserBuilder).popular().active().get();
> ```

### Local Scopes with Parameters

Scopes can accept additional arguments after the builder:

```ts
@table('users')
class User extends Model {
  @scope
  ofType(builder: ModelBuilder<User>, type: string): void {
    builder.where('type', type);
  }

  @scope
  createdAfter(builder: ModelBuilder<User>, date: Date): void {
    builder.where('created_at', '>', date);
  }
}

const admins = await (User.query() as any).ofType('admin').get();
const recent = await (User.query() as any).createdAfter(lastWeek).get();
```

---

## Model Events

Orion dispatches events at each stage of a model's lifecycle. Listeners can modify the model or cancel save/delete operations.

### Event Reference

| Event | Fired | Cancellable |
|-------|-------|-------------|
| `retrieved` | After a model is fetched from the DB | No |
| `creating` | Before INSERT | Yes |
| `created` | After INSERT | No |
| `updating` | Before UPDATE | Yes |
| `updated` | After UPDATE | No |
| `saving` | Before INSERT **or** UPDATE | Yes |
| `saved` | After INSERT **or** UPDATE | No |
| `deleting` | Before DELETE (or soft delete) | Yes |
| `deleted` | After DELETE (or soft delete) | No |
| `forceDeleting` | Before hard delete (soft-delete models) | Yes |
| `forceDeleted` | After hard delete | No |
| `restoring` | Before `restore()` | Yes |
| `restored` | After `restore()` | No |
| `replicating` | When `replicate()` is called | No |

> Mass operations (`User.where(...).delete()`, `User.where(...).update()`) do **not** fire per-model events.

### Static Hooks

Register listeners directly on the model class:

```ts
@table('users')
class User extends Model {
  static boot() {
    super.boot?.();

    // Normalize email on every save
    this.saving((user) => {
      const email = user._attributes.email as string;
      user._attributes.email = email.toLowerCase();
    });

    // Log every creation
    this.created((user) => {
      console.log(`User ${user.id} created at ${user.created_at}`);
    });

    // Log every update
    this.updated((user) => {
      console.log(`User ${user.id} updated â€” changed: ${JSON.stringify(user.getChanges())}`);
    });
  }
}
```

Shorthand methods for common events:

```ts
User.creating((user) => { /* ... */ });
User.created((user) => { /* ... */ });
User.updating((user) => { /* ... */ });
User.updated((user) => { /* ... */ });
User.saving((user) => { /* ... */ });
User.saved((user) => { /* ... */ });
User.deleting((user) => { /* ... */ });
User.deleted((user) => { /* ... */ });
User.retrieved((user) => { /* ... */ });
```

For `forceDeleting`, `forceDeleted`, `restoring`, `restored`, and `replicating`:

```ts
User.on('forceDeleted', (user) => { /* ... */ });
User.on('restored',     (user) => { /* ... */ });
User.on('replicating',  (user) => { /* ... */ });
```

### Cancelling Events

Return `false` from a `-ing` listener to cancel the operation:

```ts
User.deleting((user) => {
  if (user._attributes.is_admin) {
    console.log('Cannot delete an admin user');
    return false; // cancels delete â€” no exception, just returns false from delete()
  }
});

User.saving((user) => {
  if (!user._attributes.email) {
    return false; // prevent save if email is empty
  }
});
```

---

## Observers

For complex event handling, observers group all event listeners for a model into a single class.

### Defining an Observer

```ts
import { Observer } from '@wrsouza/orion';

class UserObserver implements Observer<User> {
  saving(user: User): void | false {
    // Normalize email
    const email = user._attributes.email as string;
    user._attributes.email = email.toLowerCase().trim();
  }

  created(user: User): void {
    // Send welcome email
    mailer.send({
      to:      user._attributes.email as string,
      subject: 'Welcome to our app!',
    });
  }

  updated(user: User): void {
    // Bust user cache
    cache.delete(`user:${user.id}`);
  }

  deleting(user: User): void | false {
    if (user._attributes.is_admin) {
      logger.warn(`Attempted to delete admin user ${user.id}`);
      return false; // cancel
    }
  }

  deleted(user: User): void {
    // Cascade-delete associated files
    storage.deleteUserFiles(user.id);
  }
}
```

All observer methods are optional â€” implement only the events you need.

### Registering Observers

```ts
User.observe(new UserObserver());
User.observe([new UserObserver(), new AuditObserver()]);
```

Or at application bootstrap:

```ts
import { ConnectionManager } from '@wrsouza/orion';

// Via URL or explicit config â€” then register observers
ConnectionManager.addConnectionUrl('default', process.env.DATABASE_URL!);
// or: ConnectionManager.addConnection('default', config);

// Register observers after connection is ready
User.observe(new UserObserver());
Post.observe(new PostObserver());
```

### The @observedBy Decorator

Register observers declaratively alongside the model definition:

```ts
import { observedBy } from '@wrsouza/orion';

@observedBy([UserObserver, AuditObserver])
@table('users')
class User extends Model {}
```

Observers registered with `@observedBy` are instantiated automatically when the class is first used.

---

## Quiet Operations

Perform an operation without firing any model events:

```ts
await user.saveQuietly();
await user.deleteQuietly();
await post.restoreQuietly();  // soft-delete models only
await post.forceDeleteQuietly();
```

Quiet variants bypass all static hooks and observers.

---

## withoutEvents

Suppress all model events for a block of code â€” events are re-enabled automatically after the callback returns:

```ts
import { withoutEvents } from '@wrsouza/orion';

await User.withoutEvents(async () => {
  await user.save();           // no saving/saved events
  await other.delete();        // no deleting/deleted events
  await User.create({ ... });  // no creating/created events
});
// Events are re-enabled here
```

`withoutEvents` is safely nestable â€” the inner block restores the outer state.

Equivalent for a single model class:

```ts
await User.withoutEvents(callback);    // suppress events on User class only
```
