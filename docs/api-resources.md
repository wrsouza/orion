# API Resources

- [Introduction](#introduction)
- [Defining a Resource](#defining-a-resource)
- [Writing Resources](#writing-resources)
  - [Conditional Attributes](#conditional-attributes)
  - [Conditional Relationships](#conditional-relationships)
  - [Conditional Aggregates](#conditional-aggregates)
  - [Conditional Pivot Data](#conditional-pivot-data)
  - [Merging Conditional Data](#merging-conditional-data)
- [Resource Collections](#resource-collections)
  - [Pagination Metadata](#pagination-metadata)
- [Data Wrapping](#data-wrapping)
- [Top-Level Metadata](#top-level-metadata)
- [Response Headers](#response-headers)
- [Binding Resources to Models](#binding-resources-to-models)
- [JSON:API Resources](#jsonapi-resources)
  - [Defining Attributes and Relationships](#defining-attributes-and-relationships)
  - [Sparse Fieldsets and Includes](#sparse-fieldsets-and-includes)
  - [Links and Meta](#links-and-meta)
  - [Collection Resources](#collection-resources)

---

## Introduction

API resources provide a transformation layer between your models and the JSON responses returned to API clients. Instead of returning models directly, resources let you control the exact shape of the response â€” including which fields are exposed, how relationships are nested, and what metadata is included.

---

## Defining a Resource

Extend `Resource<T>` and implement `toArray()`:

```ts
import { Resource } from '@wrsouza/orion';

class UserResource extends Resource<User> {
  toArray(): Record<string, unknown> {
    return {
      id:         this.resource.id,
      name:       this.resource.name,
      email:      this.resource.email,
      created_at: this.resource.created_at,
    };
  }
}
```

Resolve a single resource:

```ts
const user = await User.findOrFail(1);

new UserResource(user).toResponse();
// { data: { id: 1, name: 'Alice', email: 'alice@example.com', created_at: '...' } }

new UserResource(user).resolve();
// { id: 1, name: 'Alice', email: '...', created_at: '...' } â€” no data: wrapper
```

---

## Writing Resources

### Conditional Attributes

Include a field only when a condition is true:

```ts
class UserResource extends Resource<User> {
  toArray(): Record<string, unknown> {
    return {
      id:    this.resource.id,
      name:  this.resource.name,
      // Only include email if the user is an admin
      email: this.when(this.resource.is_admin, this.resource.email),
      // Lazy â€” closure is only called when condition is true
      token: this.when(this.resource.is_admin, () => this.resource.generateToken()),
    };
  }
}
```

`whenNotNull` â€” include only when the value is not null:

```ts
bio: this.whenNotNull(this.resource.bio),
// or with a different value to include:
bio: this.whenNotNull(this.resource.bio, this.resource.bio.toUpperCase()),
```

`whenHas` â€” include if the attribute exists on the model:

```ts
score: this.whenHas('score'),
// Useful for optional columns that may not be selected in all queries
```

### Conditional Relationships

Include a relationship only when it has been eager-loaded (prevents N+1 when the relation is not loaded):

```ts
class UserResource extends Resource<User> {
  toArray(): Record<string, unknown> {
    return {
      id:    this.resource.id,
      name:  this.resource.name,
      posts: this.whenLoaded('posts', () =>
        PostResource.collection(this.resource.getRelation('posts'))
      ),
      profile: this.whenLoaded('profile', () =>
        new ProfileResource(this.resource.getRelation('profile'))
      ),
    };
  }
}
```

If `posts` was not eager-loaded, the `posts` key is omitted entirely from the output.

### Conditional Aggregates

Include aggregate columns only when they were loaded via `withCount`, `withSum`, etc.:

```ts
class UserResource extends Resource<User> {
  toArray(): Record<string, unknown> {
    return {
      id:          this.resource.id,
      posts_count: this.whenCounted('posts'),
      orders_sum:  this.whenAggregated('orders', 'amount', 'sum'),
      orders_avg:  this.whenAggregated('orders', 'amount', 'avg'),
    };
  }
}
```

### Conditional Pivot Data

Include pivot data only when the model was loaded through a pivot relationship:

```ts
class RoleResource extends Resource<Role> {
  toArray(): Record<string, unknown> {
    return {
      id:   this.resource.id,
      name: this.resource.name,
      // pivot data available when loaded via belongsToMany
      membership: this.whenPivotLoaded('role_user', () => ({
        approved:    this.resource.getRelation<any>('pivot').get('approved'),
        assigned_at: this.resource.getRelation<any>('pivot').get('assigned_at'),
      })),
      // using a custom pivot alias set with .as('membership')
      subscription: this.whenPivotLoadedAs('subscription', 'role_user', () => ({
        status: this.resource.getRelation<any>('subscription').get('status'),
      })),
    };
  }
}
```

### Merging Conditional Data

Merge a set of key/value pairs conditionally:

```ts
class UserResource extends Resource<User> {
  toArray(): Record<string, unknown> {
    return {
      id:   this.resource.id,
      name: this.resource.name,
      ...this.mergeWhen(this.resource.is_admin, {
        admin_notes:   this.resource._attributes.admin_notes,
        last_login_ip: this.resource._attributes.last_login_ip,
      }),
    };
  }
}
```

---

## Resource Collections

### Static `collection()` method

```ts
const users = await User.all();

UserResource.collection(users).toResponse();
// { data: [ { id: 1, ... }, { id: 2, ... } ] }
```

### Custom ResourceCollection

Extend `ResourceCollection` for more control:

```ts
import { ResourceCollection } from '@wrsouza/orion';

class UserCollection extends ResourceCollection<User> {
  $collects = UserResource; // the resource class for each item
}

new UserCollection(users).toResponse();
```

### Pagination Metadata

```ts
const page = await User.paginate(15);

UserResource.collection(page.data)
  .additional({ meta: { total: page.total, last_page: page.lastPage } })
  .toResponse();
```

Or override `paginationInformation` in a custom collection:

```ts
class UserCollection extends ResourceCollection<User> {
  $collects = UserResource;

  paginationInformation(paginated: any): Record<string, unknown> {
    return {
      links: {
        first: `/users?page=1`,
        last:  `/users?page=${paginated.lastPage}`,
        next:  paginated.hasMorePages ? `/users?page=${paginated.currentPage + 1}` : null,
      },
      meta: {
        total:        paginated.total,
        per_page:     paginated.perPage,
        current_page: paginated.currentPage,
        last_page:    paginated.lastPage,
      },
    };
  }
}
```

---

## Data Wrapping

All resources are wrapped in a `data` key by default:

```ts
new UserResource(user).toResponse();
// { data: { id: 1, ... } }
```

Disable wrapping globally:

```ts
Resource.withoutWrapping();
// All resources now return unwrapped objects: { id: 1, ... }
```

---

## Top-Level Metadata

### `additional()` â€” runtime

Merge additional top-level keys into the response:

```ts
new UserResource(user)
  .additional({ meta: { api_version: 2, server: 'us-east-1' } })
  .toResponse();
// { data: { id: 1, ... }, meta: { api_version: 2, server: 'us-east-1' } }
```

### `with()` â€” declarative in subclass

Override in the resource class for static top-level metadata:

```ts
class UserResource extends Resource<User> {
  with(): Record<string, unknown> {
    return { api_version: 2 };
  }

  toArray(): Record<string, unknown> {
    return { id: this.resource.id, name: this.resource.name };
  }
}

new UserResource(user).toResponse();
// { data: { id: 1, name: 'Alice' }, api_version: 2 }
```

---

## Response Headers

Attach custom HTTP headers to a resource response:

```ts
const response = new UserResource(user)
  .withResponseHeaders({ 'X-User-Version': '2', 'Cache-Control': 'no-store' })
  .response();

// response.data    â€” the resource payload
// response.headers â€” { 'X-User-Version': '2', ... }
```

---

## Binding Resources to Models

Bind a resource class to a model so it can auto-resolve itself:

```ts
import { UseResource, UseResourceCollection } from '@wrsouza/orion';

@UseResource(UserResource)
@UseResourceCollection(UserCollection)
@table('users')
class User extends Model {}

// On a model instance
const user = await User.findOrFail(1);
user.toResource();              // returns new UserResource(user)
user.toResource().toResponse(); // { data: { ... } }

// On a ModelCollection
const users = await User.all();
users.toResourceCollection().toResponse(); // { data: [ ... ] }
```

---

## JSON:API Resources

`JsonApiResource<T>` produces JSON:API 1.1 compliant documents with correct `type`, `id`, `attributes`, and `relationships` structure.

### Basic Usage

```ts
import { JsonApiResource } from '@wrsouza/orion';

class UserResource extends JsonApiResource<User> {
  $type = 'users';
  $attributes = ['name', 'email', 'created_at'];
  $relationships = ['posts'];
}

new UserResource(user).toResponse();
// {
//   data: {
//     type: 'users',
//     id: '1',
//     attributes: { name: 'Alice', email: 'alice@example.com', created_at: '...' },
//     relationships: { posts: { data: [{ type: 'posts', id: '1' }] } }
//   }
// }
```

### Defining Attributes and Relationships

Override `toAttributes()` and `toRelationships()` for full control:

```ts
class UserResource extends JsonApiResource<User> {
  $type = 'users';

  toType(): string {
    return 'users';
  }

  toId(): string {
    return String(this.resource.id);
  }

  toAttributes(): Record<string, unknown> {
    return {
      name:       this.resource.name,
      email:      this.resource.email,
      created_at: this.resource.created_at,
    };
  }

  toRelationships(): Record<string, unknown> {
    return {
      posts: PostResource.jsonApiCollection(
        this.resource.getRelation<any>('posts') ?? []
      ),
    };
  }
}
```

### Sparse Fieldsets and Includes

Pass a request context to enable JSON:API sparse fieldsets (`?fields[users]=name,email`) and includes (`?include=posts`):

```ts
const ctx = {
  fields:  { users: ['name', 'email'] },
  include: ['posts'],
};

new UserResource(user, ctx).toResponse();
// Only 'name' and 'email' returned in attributes; posts relationship included
```

Enable query-string parsing automatically (opt-in per resource class):

```ts
class UserResource extends JsonApiResource<User> {
  $type = 'users';
  $attributes = ['name', 'email'];

  constructor(resource: User, ctx?: any) {
    super(resource, ctx);
    this.includePreviouslyLoadedRelationships();
  }
}
```

### Links and Meta

```ts
class UserResource extends JsonApiResource<User> {
  $type = 'users';
  $attributes = ['name'];

  toLinks(): Record<string, string> {
    return { self: `/api/users/${this.resource.id}` };
  }

  toMeta(): Record<string, unknown> {
    return { version: 1, last_updated: this.resource.updated_at };
  }
}
```

### Collection Resources

```ts
import { JsonApiCollectionResource } from '@wrsouza/orion';

const users = await User.with('posts').get();

JsonApiCollectionResource.make(UserResource, users).toResponse();
// {
//   data: [
//     { type: 'users', id: '1', attributes: { ... }, relationships: { ... } },
//     ...
//   ]
// }
```

Global depth limit:

```ts
JsonApiResource.maxRelationshipDepth(2); // default: 3
```
