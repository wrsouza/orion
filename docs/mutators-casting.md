# Mutators & Casting

- [Introduction](#introduction)
- [Accessors](#accessors)
  - [Accessor Caching](#accessor-caching)
  - [Appending to Serialization](#appending-to-serialization)
- [Mutators](#mutators)
- [Attribute Casting](#attribute-casting)
  - [Built-in Cast Types](#built-in-cast-types)
  - [Array and JSON Casting](#array-and-json-casting)
  - [Date Casting](#date-casting)
  - [Enum Casting](#enum-casting)
  - [Encrypted Casting](#encrypted-casting)
  - [Query-Time Casting](#query-time-casting)
- [Custom Casts](#custom-casts)
  - [CastClass â€” Bidirectional](#castclass--bidirectional)
  - [CastsInboundAttributes â€” Write-Only](#castsinboundattributes--write-only)
  - [Castable Value Objects](#castable-value-objects)
  - [Cast Parameters](#cast-parameters)
  - [Comparing Cast Values](#comparing-cast-values)
  - [SerializesCastableAttributes](#serializescastableattributes)
- [Runtime Cast Overrides](#runtime-cast-overrides)

---

## Introduction

Accessors, mutators, and attribute casting let you transform values when reading from or writing to a model. For example, you might want to always uppercase an email, hash a password before storage, or cast a JSON column to a typed object.

---

## Accessors

An accessor computes a value from model attributes when the property is read. Define a getter and decorate it with `@accessor`:

```ts
import { Model, table, accessor, appends } from '@wrsouza/orion';

@table('users')
@appends(['full_name'])
class User extends Model {
  declare first_name: string;
  declare last_name: string;

  @accessor
  get fullName(): string {
    return `${this.first_name} ${this.last_name}`;
  }
}

const user = await User.findOrFail(1);
user.fullName; // 'Alice Smith'
```

Accessors that transform existing database columns are read automatically when you access the attribute name:

```ts
@table('users')
class User extends Model {
  @accessor
  get email(): string {
    return (this._attributes.email as string).toLowerCase();
  }
}

user.email; // always lowercase, regardless of DB value
```

### Accessor Caching

By default, object-returning accessors are cached per-instance â€” changes to the returned object are synced back before save. For expensive primitive computations, opt into caching explicitly:

```ts
@table('users')
class User extends Model {
  @accessor
  get gravatarHash(): string {
    return md5(this.email);
  }
}
// If md5 is expensive, this runs every time `user.gravatarHash` is read.
// For now, cache the result yourself if needed.
```

Disable object caching (when you want a fresh value object on each access):

```ts
import { withoutObjectCaching } from '@wrsouza/orion';

@table('users')
class User extends Model {
  @accessor
  @withoutObjectCaching
  get address(): Address {
    return new Address(this._attributes.street, this._attributes.city);
  }
}
```

### Appending to Serialization

Accessors are NOT included in `toArray()` / `toJSON()` by default. Use `@appends` to include them:

```ts
@table('users')
@appends(['full_name', 'avatar_url'])
class User extends Model {
  @accessor
  get fullName(): string {
    return `${this.first_name} ${this.last_name}`;
  }

  @accessor
  get avatarUrl(): string {
    return `https://cdn.example.com/avatars/${this.id}.jpg`;
  }
}

user.toArray();
// { id: 1, first_name: 'Alice', last_name: 'Smith', full_name: 'Alice Smith', avatar_url: '...' }
```

Add appended attributes at runtime:

```ts
user.append('full_name').toArray();
user.setAppends(['full_name', 'avatar_url']).toArray();
user.withoutAppends().toArray();
```

---

## Mutators

A mutator transforms a value before it is stored in `_attributes`. Define a setter and decorate it with `@mutator`:

```ts
import { Model, table, mutator } from '@wrsouza/orion';
import bcrypt from 'bcrypt';

@table('users')
class User extends Model {
  declare password: string;

  @mutator
  set password(value: string) {
    this._attributes.password = bcrypt.hashSync(value, 10);
  }
}

const user = new User();
user.password = 'secret';   // triggers mutator â€” stored as bcrypt hash
await user.save();
```

Mutators can transform the value in any way â€” normalizing strings, deriving computed columns, etc.:

```ts
@table('products')
class Product extends Model {
  @mutator
  set name(value: string) {
    this._attributes.name = value.trim();
    this._attributes.slug = value.trim().toLowerCase().replace(/\s+/g, '-');
  }
}
```

---

## Attribute Casting

Use `@casts` to automatically transform attributes when reading from or writing to the model. No code needed in the class body.

```ts
import { Model, table, casts } from '@wrsouza/orion';

@table('products')
@casts({
  price:          'number',
  is_active:      'boolean',
  settings:       'json',
  tags:           'array',
  published_at:   'date',
  score:          'decimal:2',
  description:    'AsStringable',
  secret_key:     'encrypted',
})
class Product extends Model {}
```

### Built-in Cast Types

| Cast type | Read (get) | Write (set) |
|-----------|-----------|------------|
| `'number'` | `Number(value)` | stored as-is |
| `'string'` | `String(value)` | stored as-is |
| `'boolean'` | `Boolean(value)` | stored as-is |
| `'json'` | `JSON.parse(value)` | `JSON.stringify(value)` |
| `'array'` | `JSON.parse(value)` (always array) | `JSON.stringify(value)` |
| `'date'` | `new Date(value)` | `.toISOString()` |
| `'datetime'` | `new Date(value)` | `.toISOString()` |
| `'decimal:<n>'` | `parseFloat(value).toFixed(n)` | stored as-is |
| `'hashed'` | returned as-is (one-way) | SHA-256 hash via `crypto` |
| `'immutable_date'` | `Object.freeze(new Date(value))` | `.toISOString()` |
| `'immutable_datetime'` | `Object.freeze(new Date(value))` | `.toISOString()` |
| `'json:unicode'` | `JSON.parse(value)` | `JSON.stringify(value, null, 0)` (no unicode escape) |
| `'AsStringable'` | `new Stringable(value)` | `.toString()` |
| `'encrypted'` | decrypted string | encrypted string |
| `'encrypted:array'` | decrypted + JSON.parse | JSON.stringify + encrypt |
| `'encrypted:json'` | decrypted + JSON.parse | JSON.stringify + encrypt |

### Array and JSON Casting

```ts
@casts({ settings: 'json', tags: 'array' })
class User extends Model {}

user.settings = { theme: 'dark', notifications: true };
// stored as: '{"theme":"dark","notifications":true}'

user.tags = ['typescript', 'orm'];
// stored as: '["typescript","orm"]'

// After reading:
user.settings; // { theme: 'dark', notifications: true }
user.tags;     // ['typescript', 'orm']
```

### Date Casting

```ts
@casts({ published_at: 'date', scheduled_at: 'datetime' })
class Post extends Model {}

post.published_at; // Date object
post.published_at = new Date('2024-06-01');
```

Override the serialization format on a per-model basis:

```ts
class Post extends Model {
  serializeDate(date: Date): string {
    return date.toISOString().slice(0, 10); // 'YYYY-MM-DD'
  }
}
```

### Enum Casting

Cast a string column to a TypeScript enum:

```ts
enum UserRole {
  Admin  = 'admin',
  Editor = 'editor',
  Viewer = 'viewer',
}

// The column stores 'admin', 'editor', etc. as strings.
// For a full enum cast class, implement CastClass below.
```

### Encrypted Casting

Encrypted casts require a `CipherContract` implementation on `Model._cipher`. Set it once at application startup:

```ts
import { Model } from '@wrsouza/orion';

Model._cipher = {
  encrypt: (plaintext: string): string =>
    Buffer.from(plaintext).toString('base64'), // replace with real encryption

  decrypt: (ciphertext: string): string =>
    Buffer.from(ciphertext, 'base64').toString(),
};
```

Then use in cast declarations:

```ts
@casts({
  api_token:    'encrypted',
  preferences:  'encrypted:json',
  allowed_ips:  'encrypted:array',
})
class User extends Model {}
```

### Query-Time Casting

Apply casts dynamically for a single query without affecting the model definition:

```ts
const products = await Product.withCasts({ price: 'decimal:4' }).get();
```

---

## Custom Casts

### CastClass â€” Bidirectional

Implement `CastClass` for bidirectional transformations:

```ts
import { CastClass } from '@wrsouza/orion';

class MoneyCast implements CastClass {
  get(value: unknown): Money {
    return new Money(value as number, 'USD');
  }
  set(value: unknown): unknown {
    return value instanceof Money ? value.amount : Number(value);
  }
}

@casts({ price: MoneyCast })
class Product extends Model {}

product.price;              // Money { amount: 1999, currency: 'USD' }
product.price = new Money(2999, 'USD');
await product.save();       // stores: 2999
```

### CastsInboundAttributes â€” Write-Only

When you only need a write-side transformation (e.g. one-way hashing), implement `CastsInboundAttributes`:

```ts
import { CastsInboundAttributes } from '@wrsouza/orion';
import { createHash } from 'crypto';

class Sha256Cast implements CastsInboundAttributes {
  set(value: unknown): string {
    return createHash('sha256').update(String(value)).digest('hex');
  }
}

@casts({ api_key: Sha256Cast })
class Application extends Model {}
```

### Castable Value Objects

For value objects that know how to cast themselves, implement `Castable`:

```ts
import { Castable, CastClass } from '@wrsouza/orion';

class Address implements Castable {
  constructor(
    public readonly street: string,
    public readonly city: string,
    public readonly country: string,
  ) {}

  static castUsing(): CastClass {
    return {
      get(value: unknown): Address {
        const data = typeof value === 'string' ? JSON.parse(value) : value as any;
        return new Address(data.street, data.city, data.country);
      },
      set(value: unknown): string {
        const a = value as Address;
        return JSON.stringify({ street: a.street, city: a.city, country: a.country });
      },
    };
  }
}

@casts({ address: Address })
class User extends Model {}

user.address; // Address instance
```

### Cast Parameters

Pass parameters to a cast class using the `CastClass:param1,param2` string syntax:

```ts
class RoundedDecimalCast implements CastClass {
  constructor(private readonly precision: number) {}

  static withParams(params: string[]): CastClass {
    return new RoundedDecimalCast(parseInt(params[0] ?? '2'));
  }

  get(value: unknown): number {
    return parseFloat(parseFloat(String(value)).toFixed(this.precision));
  }
  set(value: unknown): number {
    return parseFloat(String(value));
  }
}

@casts({ price: 'RoundedDecimalCast:4' })
class Product extends Model {}
```

### Comparing Cast Values

Implement `ComparesCastableAttributes` when Orion should use a custom equality check for dirty tracking:

```ts
import { ComparesCastableAttributes } from '@wrsouza/orion';

class MoneyCast implements CastClass, ComparesCastableAttributes {
  get(value: unknown): Money { /* ... */ }
  set(value: unknown): unknown { /* ... */ }

  compare(a: unknown, b: unknown): boolean {
    const ma = a instanceof Money ? a : new Money(a as number);
    const mb = b instanceof Money ? b : new Money(b as number);
    return ma.amount === mb.amount && ma.currency === mb.currency;
  }
}
```

### SerializesCastableAttributes

Implement `SerializesCastableAttributes` on a value object to control how it is serialized in `toArray()` / `toJSON()`:

```ts
interface SerializesCastableAttributes {
  serialize(): unknown;
}

class Money implements SerializesCastableAttributes {
  constructor(public amount: number, public currency = 'USD') {}

  serialize(): Record<string, unknown> {
    return { amount: this.amount, currency: this.currency };
  }
}
```

---

## Runtime Cast Overrides

Add casts at runtime for a specific instance or query:

```ts
// Per-instance
product.mergeCasts({ score: 'decimal:4' });

// Per-query (all returned models get these casts applied)
const products = await Product.withCasts({ price: MoneyCast }).get();
```
