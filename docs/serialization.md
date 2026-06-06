# Serialization

- [Introduction](#introduction)
- [Serializing to Arrays](#serializing-to-arrays)
- [Serializing to JSON](#serializing-to-json)
- [Hiding Attributes](#hiding-attributes)
- [Exposing Attributes (visible)](#exposing-attributes-visible)
- [Temporarily Modifying Visibility](#temporarily-modifying-visibility)
- [Appending Computed Values](#appending-computed-values)
  - [Runtime Appends](#runtime-appends)
- [Date Serialization](#date-serialization)

---

## Introduction

When building an API, you need to control which attributes are exposed, how dates are formatted, and whether computed properties appear in the output. Orion handles all of this through decorators and per-instance override methods.

For advanced transformation logic, use [API Resources](./api-resources.md) instead of raw serialization.

---

## Serializing to Arrays

```ts
const user = await User.with('roles').firstOrFail();

// All attributes + all loaded relations, recursively
const data = user.toArray();
// { id: 1, name: 'Alice', email: 'a@example.com', roles: [{ id: 1, name: 'admin' }] }

// Attributes only — no relations
const attrs = user.attributesToArray();
// { id: 1, name: 'Alice', email: 'a@example.com' }
```

Collections serialize with `toArray()` too:

```ts
const users = await User.with('roles').get();
users.toArray(); // array of plain objects, relations included
```

---

## Serializing to JSON

```ts
const user = await User.findOrFail(1);

const json = JSON.stringify(user);          // calls toArray() internally
const json = JSON.stringify(await User.all()); // works on collections too
```

Because Orion implements `toJSON()`, models and collections can be returned directly from any framework that calls `JSON.stringify` (Express, Fastify, etc.):

```ts
// Express
app.get('/users', async (req, res) => {
  res.json(await User.all()); // automatically serialized
});
```

---

## Hiding Attributes

Use `@hidden` to exclude sensitive columns from serialization:

```ts
import { Model, table, hidden } from '@wrsouza/orion';

@table('users')
@hidden(['password', 'remember_token', 'two_factor_secret'])
class User extends Model {}

user.toArray();
// { id: 1, name: 'Alice', email: 'a@example.com' }
// password, remember_token, two_factor_secret are omitted
```

You can also hide relationships by adding the relation name to `@hidden`.

---

## Exposing Attributes (visible)

`@visible` is the inverse of `@hidden` — only listed columns appear in serialization. All other columns are hidden:

```ts
@table('users')
@visible(['id', 'name', 'email'])
class User extends Model {}

user.toArray();
// { id: 1, name: 'Alice', email: 'a@example.com' }
// All other columns — password, settings, etc. — are excluded
```

> `@visible` and `@hidden` are mutually exclusive. Prefer `@visible` when you want an explicit allowlist, and `@hidden` when you just want to exclude a few sensitive columns.

---

## Temporarily Modifying Visibility

All these methods return `this` so they can be chained directly into `toArray()`:

```ts
const data = user.makeVisible('phone').toArray();
// Exposes 'phone' even if it's in @hidden

const data = user.makeHidden('email').toArray();
// Hides 'email' for this call only

// Replace the entire visible/hidden list for this instance
const data = user.setVisible(['id', 'name']).toArray();
const data = user.setHidden(['password', 'ssn']).toArray();

// Add to the current list without replacing
const data = user.mergeVisible(['phone']).toArray();
const data = user.mergeHidden(['internal_notes']).toArray();
```

These work on `ModelCollection` too and delegate to each model in the collection:

```ts
const users = await User.get();
users.makeVisible(['phone']).toArray();
users.makeHidden(['email']).toArray();
users.setVisible(['id', 'name']).toArray();
users.mergeHidden(['secret']).toArray();
```

---

## Appending Computed Values

Computed accessors are excluded from serialization by default. Use `@appends` to include them permanently:

```ts
import { Model, table, appends, accessor } from '@wrsouza/orion';

@table('users')
@appends(['full_name', 'is_veteran'])
class User extends Model {
  declare created_at: Date;

  @accessor
  get fullName(): string {
    return `${this._attributes.first_name} ${this._attributes.last_name}`;
  }

  @accessor
  get isVeteran(): boolean {
    const years = (Date.now() - this.created_at.getTime()) / (365.25 * 86400e3);
    return years >= 5;
  }
}

user.toArray();
// { id: 1, first_name: 'Alice', ..., full_name: 'Alice Smith', is_veteran: false }
```

> Accessor methods use camelCase (`fullName`) but the appended key uses snake_case (`full_name`). Orion converts automatically.

Appended attributes respect `@visible` and `@hidden`:

```ts
@hidden(['full_name'])   // hide the appended attribute
@appends(['full_name'])
class User extends Model {}

user.toArray(); // full_name is NOT included
user.makeVisible('full_name').toArray(); // now included
```

### Runtime Appends

```ts
// Add an accessor to the output for this call
user.append('full_name').toArray();
user.append(['full_name', 'avatar_url']).toArray();

// Replace the entire appends list
user.setAppends(['full_name']).toArray();

// Remove all appended attributes
user.withoutAppends().toArray();

// Merge with existing list
user.mergeAppends(['new_attr']).toArray();
```

---

## Date Serialization

Orion serializes `Date` objects to ISO 8601 strings by default. Override per model by implementing `serializeDate()`:

```ts
@table('posts')
class Post extends Model {
  serializeDate(date: Date): string {
    return date.toISOString().slice(0, 10); // 'YYYY-MM-DD'
  }
}
```

Control the format per individual column using cast declarations:

```ts
@casts({
  born_at:    'date:Y-m-d',
  meeting_at: 'datetime:Y-m-d H:00',
})
class User extends Model {}
```
