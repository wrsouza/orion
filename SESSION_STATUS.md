# orion — Session Status

> Last updated: 2026-06-06
> Use this file to onboard a new session quickly.

---

## What is orion?

An Eloquent-inspired Active Record ORM for TypeScript, built from scratch (no Knex/TypeORM).
PostgreSQL driver only for now. Open-source, MIT licensed.

Repository: `C:\Projects\orion`

---

## Architecture Overview

```
src/
├── connection/
│   ├── Connection.ts                  ✅ Interface (query, transaction, disconnect)
│   ├── ConnectionManager.ts           ✅ Named connection registry
│   └── adapters/
│       └── PostgresAdapter.ts         ✅ Pool + nested transactions via savepoints
│
├── schema/
│   ├── Blueprint.ts                   ✅ Fluent table builder (30+ column methods)
│   ├── ColumnDefinition.ts            ✅ Types + modifiers (.nullable, .default, .unique)
│   ├── ForeignKeyDefinition.ts        ✅ .references().on().onDelete()
│   ├── IndexDefinition.ts             ✅
│   ├── Schema.ts                      ✅ Facade: create/table/drop/hasTable/hasColumn
│   └── grammars/
│       ├── SchemaGrammar.ts           ✅ Interface
│       └── PostgresSchemaGrammar.ts   ✅ Compiles Blueprint → DDL SQL
│
├── migrations/
│   ├── Migration.ts                   ✅ Abstract base (up/down)
│   ├── MigrationRepository.ts         ✅ Tracks state in orion_migrations table
│   └── Migrator.ts                    ✅ run / rollback / reset / status
│
├── cli/
│   ├── index.ts                       ✅ Entry point (bin: orion)
│   ├── commands/
│   │   ├── MigrateCommand.ts          ✅
│   │   ├── RollbackCommand.ts         ✅
│   │   ├── StatusCommand.ts           ✅
│   │   └── MakeMigrationCommand.ts    ✅ Smart template generation
│   └── utils/
│       ├── colors.ts                  ✅
│       └── config.ts                  ✅ Loads orion.config.js
│
├── query/
│   ├── Expression.ts                  ✅ raw() helper
│   ├── JoinClause.ts                  ✅ on/orOn/onRaw
│   ├── QueryBuilder.ts                ✅ Full fluent builder (50+ methods)
│   └── grammars/
│       ├── QueryGrammar.ts            ✅ Interface
│       └── PostgresQueryGrammar.ts    ✅ $1/$2 positional params
│
└── model/
    ├── Model.ts                       ✅ Active Record base class
    ├── ModelBuilder.ts                ✅ Typed builder + withSum/Min/Max/Avg/Exists + whereRelation + loadModels
    ├── ModelMetadata.ts               ✅ Per-class config registry (with EventDispatcher)
    ├── MorphMap.ts                    ✅ Polymorphic type alias registry
    ├── Collection.ts                  ✅ Typed array wrapper (25+ helpers)
    ├── EagerLoader.ts                 ✅ Batch eager loading
    ├── decorators/
    │   ├── table.ts                   ✅ @table, @withoutTimestamps
    │   ├── fillable.ts                ✅ @fillable, @guarded
    │   ├── cast.ts                    ✅ @casts, @hidden
    │   ├── scope.ts                   ✅ @scope (local), @scopedBy (global)
    │   └── observe.ts                 ✅ @observedBy
    ├── events/
    │   ├── ModelEvents.ts             ✅ ModelEvent type + ModelListener type
    │   ├── EventDispatcher.ts         ✅ fire() / fireSync() / withoutEvents()
    │   └── Observer.ts                ✅ Observer<T> interface
    ├── scopes/
    │   ├── Scope.ts                   ✅ Interface
    │   └── SoftDeleteScope.ts         ✅ WHERE deleted_at IS NULL
    ├── concerns/
    │   └── SoftDeletes.ts             ✅ Mixin: delete/forceDelete/restore + quiet variants
    └── relations/
        ├── Relation.ts                ✅ Abstract base + getAggregateQuery()
        ├── HasOne.ts                  ✅ + latestOfMany / oldestOfMany / ofMany
        ├── HasMany.ts                 ✅
        ├── HasOneThrough.ts           ✅
        ├── HasManyThrough.ts          ✅
        ├── BelongsTo.ts               ✅ + associate/dissociate + withDefault
        ├── BelongsToMany.ts           ✅ + attach/detach/sync/toggle + wherePivot/orderByPivot/as
        ├── PivotRecord.ts             ✅
        ├── MorphOne.ts                ✅
        ├── MorphMany.ts               ✅
        ├── MorphTo.ts                 ✅ (eager load groups by type)
        ├── MorphToMany.ts             ✅
        └── MorphedByMany.ts           ✅
```

---

## Completed Phases

| Phase | Feature |
|-------|---------|
| 1 | PostgreSQL driver, Schema builder, Migrations, CLI |
| 2 | Query Builder — full fluent API (50+ methods, $1/$2 params) |
| 3 | Model base class, dirty tracking via Proxy, CRUD, mass assignment, casting, Collection<T> |
| 4 | Soft deletes mixin, Global/Local scopes |
| 5 | Model Events & Observers — full lifecycle, `@observedBy`, saveQuietly/deleteQuietly/withoutEvents |
| 6 | Relationships Tier 1 — hasOne, hasMany, belongsTo, belongsToMany, eager loading, has/whereHas, withCount, pivot ops |
| 7 | Relationships Tier 2 — hasOneThrough, hasManyThrough, all morph variants, withSum/Min/Max/Avg/Exists, whereRelation, load/loadMissing/loadCount, latestOfMany/ofMany, withDefault, wherePivot/orderByPivot/as, MorphMap |
| 8 | Tier 2 Completion — loadSum/Min/Max/Avg, orHas/orWhereHas/orDoesntHave/orWhereDoesntHave, whereHasMorph/whereDoesntHaveMorph, withPivotValue, Model.preventLazyLoading() |
| 9 | Serialization — @visible, @appends, makeVisible/Hidden, setVisible/Hidden, mergeVisible/Hidden, append/mergeAppends/setAppends/withoutAppends, attributesToArray(), toArray() with recursive relations, toJSON() → toArray(), Proxy receiver fix |
| 10 | Accessors & Mutators — @accessor, @mutator, CastClass/CastClassConstructor (class-based casts), _castSet, withCasts() on ModelBuilder, Proxy set receiver + mutator dispatch |
| 11 | ModelCollection<T> — findByKey, findOrFail, modelKeys, except, only, diff, intersect, toQuery, fresh, load, loadMissing, makeVisible/Hidden, setVisible/Hidden; returned by all collection-producing relations and ModelBuilder.get() |
| 12 | Pagination — Paginator<T> (data + total + lastPage + from/to + hasMorePages), SimplePaginator<T> (no total count, 1 query), paginate() and simplePaginate() on ModelBuilder |
| 13 | Factories — Factory<T> abstract base, Sequence, count/state/sequence/afterMaking/afterCreating/has/for, Model.factory() via `_factory` static property |
| 14 | MySQL Driver — MySQLAdapter (mysql2, savepoints), MySQLQueryGrammar (?-params, backticks), MySQLSchemaGrammar (AUTO_INCREMENT, ENGINE=InnoDB, TINYINT bool, optional dep) |
| 15 | SQLite Driver — SQLiteAdapter (better-sqlite3, WAL, FK pragma, savepoints), SQLiteQueryGrammar (?-params, double-quotes), SQLiteSchemaGrammar (INTEGER PRIMARY KEY AUTOINCREMENT, inline FKs, TEXT for dates/json/uuid) |
| 16 | API Resources — Resource<T>, ResourceCollection<T>, when/mergeWhen/whenLoaded conditionals, toResponse/resolve, collection/make static helpers |
| 17 | MariaDB Driver — MariaDBAdapter (mariadb pkg, savepoints), MariaDBQueryGrammar (RETURNING for INSERT/UPDATE/DELETE), MariaDBSchemaGrammar (UUID type, JSON alias) |
| 18 | SQL Server Driver — SQLServerAdapter (mssql, SAVE TRANSACTION savepoints), SQLServerQueryGrammar (@p1 params, [brackets], TOP/OFFSET-FETCH, OUTPUT INSERTED, MERGE upsert), SQLServerSchemaGrammar (IDENTITY, BIT, NVARCHAR, UNIQUEIDENTIFIER, DATETIME2) |
| 19 | Model Convenience Methods — `saveOrFail/deleteOrFail/updateOrFail`, `destroyAndFire/forceDestroy`, `increment/decrement` on instance, `getPrevious()`, `withoutTimestamps()`, `preventSilentlyDiscardingAttributes()`, `_defaults`, `firstOr()`; ModelBuilder: `firstOr`, `chunkById`, `lazy`, `lazyById` |
| 20 | Relations Save/Create/Touch/Pivot — `saveMany/createMany` on HasOne/MorphOne; `syncWithPivotValues` on BelongsToMany/MorphToMany/MorphedByMany; `_touches`/`touch()` on Model; ModelBuilder: `whereAttachedTo/orWhereAttachedTo`, `whereMorphedTo/whereNotMorphedTo`, `whereMorphRelation/orWhereMorphRelation` |
| 21 | ModelCollection Extras — `contains`, `unique`, `partition`, `append/setAppends/withoutAppends`, `mergeVisible/mergeHidden`, `loadCount/loadSum/loadMin/loadMax/loadAvg`, `toResourceCollection` |
| 22 | Casting Enhancements — `mergeCasts()`, `serializeDate()`, `withoutObjectCaching()`; new cast types: `decimal:<n>`, `hashed`, `immutable_date/datetime`, `json:unicode`, `AsStringable`, `encrypted/encrypted:array/json`; interfaces: `CastsInboundAttributes`, `Castable/CastableConstructor`, `ComparesCastableAttributes`; cast caching via `shouldCache()`; `CipherContract`; `Stringable` helper; cast params support |
| 23 | API Resource Enhancements — `whenHas`, `whenNotNull`, `whenCounted`, `whenAggregated`, `whenPivotLoaded/As`; `additional()`/`with()`/`withResponse()` on Resource; `Resource.withoutWrapping()`; `response()` → `ResourceResponse`; ResourceCollection: `paginationInformation`, `with()`, `withResponse()`, `response()`; `toResource()`/`toResourceCollection()` on Model/ModelCollection; `@UseResource`/`@UseResourceCollection` decorators |
| 24 | Factory Enhancements — `configure()` hook, `trashed()`, `hasAttached(factory, pivotAttrs?)`, `recycle(model|Collection)`, magic `has{Relation}()`/`for{Relation}()` via Proxy |
| 25 | UUID/ULID & Pruning — `HasUuids` mixin (UUID v4, `newUniqueId()`, `uniqueIds()`), `HasUlids` mixin (compact ULID, no deps), `Prunable` mixin (per-row with `pruning()` hook), `MassPrunable` mixin (bulk DELETE), CLI `model:prune [--model=X] [--chunk=N]` |
| 26 | Dynamic Relations & Scoped Relationships — `Model.resolveRelationUsing(name, closure)`, `Relation.withAttributes(attrs, asConditions?)`, `chaperone()` on HasMany/MorphMany |
| 27 | JSON:API Resources — `JsonApiResource<T>` (declarative `$type`/`$attributes`/`$relationships`, `toAttributes/toRelationships/toLinks/toMeta/toId/toType` overrides, sparse fieldsets, includes with depth limit, `includePreviouslyLoadedRelationships`, `ignoreFieldsAndIncludesInQueryString`, `maxRelationshipDepth`), `JsonApiCollectionResource`, full types: `JsonApiDocument`, `JsonApiResourceObject`, etc. |

---

## Remaining Phases — Full Roadmap

Phases are ordered by priority. Do NOT skip ahead without finishing the current one.

> Last gap-audit: 2026-06-06 against Laravel Eloquent 13.x docs.

---

### Phase 8 — Tier 2 Completion ✅ COMPLETE

---

### Phase 9 — Serialization ✅ COMPLETE

---

### Phase 10 — Accessors & Mutators ✅ COMPLETE

---

### Phase 11 — Collection model-aware methods ✅ COMPLETE

---

### Phase 12 — Pagination ✅ COMPLETE

---

### Phase 13 — Factories ✅ COMPLETE

#### 8.1 — `loadSum / loadMin / loadMax / loadAvg` on Model instance

Like `loadCount`, but for aggregate functions. Results stored in `_relations` as `{relation}_{fn}_{column}`.

```ts
await user.loadSum('orders', 'amount');
user.getRelation<number>('orders_sum_amount');

await user.loadMax('orders', 'amount');
await user.loadMin('orders', 'created_at');
await user.loadAvg('orders', 'rating');
```

**Implementation:** Same pattern as `loadCount` in `Model.ts`. Run a query with `withSum/Min/Max/Avg` on a fresh builder filtered by this model's PK, then copy the result into `_relations`.

**File:** `src/model/Model.ts` — add `loadSum(relation, column)`, `loadMin`, `loadMax`, `loadAvg` alongside existing `loadCount`.

---

#### 8.2 — `orHas / orWhereHas / orDoesntHave / orWhereDoesntHave` on ModelBuilder

OR variants of the existing existence checks.

```ts
Post.has('comments').orHas('likes').get()
Post.whereHas('comments', q => q.where('approved', true))
    .orWhereHas('tags', q => q.where('name', 'featured'))
    .get()
Post.doesntHave('comments').orDoesntHave('tags').get()
```

**Implementation:** Mirror the existing `has / whereHas / doesntHave / whereDoesntHave` in `ModelBuilder.ts`, but use `orWhereRaw` instead of `whereRaw`.

**File:** `src/model/ModelBuilder.ts` — add `orHas`, `orWhereHas`, `orDoesntHave`, `orWhereDoesntHave`.

---

#### 8.3 — `whereHasMorph / whereDoesntHaveMorph` on ModelBuilder

Existence checks on polymorphic relations — query models that have a morph relation pointing to specific types.

```ts
// Comments that are commentable (attached to any morphable)
Comment.whereHasMorph('commentable', '*').get()

// Comments attached to Post OR Video
Comment.whereHasMorph('commentable', [Post, Video]).get()

// Comments attached to a Post with published = true
Comment.whereHasMorph('commentable', [Post], q => q.where('published', true)).get()
```

**Implementation:**
- Resolve the `MorphTo` relation from the model
- Get `morphType` and `morphId` column names from the relation
- For each type (or `'*'` for all registered in MorphMap), build a `WHERE EXISTS` subquery:
  `EXISTS (SELECT 1 FROM {related_table} WHERE {related_table}.id = {this_table}.{morphId} AND {this_table}.{morphType} = '{type}')`
- Combine with OR if multiple types
- Apply optional callback constraint per type

**File:** `src/model/ModelBuilder.ts` — add `whereHasMorph(relation, types, callback?)` and `whereDoesntHaveMorph(relation, types, callback?)`.

---

#### 8.4 — `withPivotValue` on BelongsToMany / MorphToMany

Set a fixed value on the pivot when attaching, without needing to pass it every time.

```ts
class User extends Model {
  roles(): BelongsToMany<Role> {
    return this.belongsToMany(Role)
      .withPivot('approved')
      .withPivotValue('approved', true);  // default: always set approved = true on attach
  }
}

await user.roles().attach(1);  // pivot row: { user_id: 1, role_id: 1, approved: true }
```

**Implementation:** Store `_pivotValues: Record<string, unknown> = {}` on `BelongsToMany`. Merge `_pivotValues` into every `attach()` call automatically.

**Files:** `src/model/relations/BelongsToMany.ts` and `src/model/relations/MorphToMany.ts`.

---

#### 8.5 — Prevent Lazy Loading

Global flag that throws when a relation is accessed without eager loading. Useful in production/staging to catch N+1 bugs early.

```ts
// Enable globally (e.g. in app bootstrap or test setup)
Model.preventLazyLoading();           // throws on any lazy load attempt
Model.preventLazyLoading(false);      // disable
Model.preventLazyLoading(process.env.NODE_ENV !== 'production');

// When triggered:
// LazyLoadingViolationError: Attempted to lazy load [posts] on model [User] without eager loading.
```

**Implementation:**
- Static flag `Model._preventLazyLoading = false`
- `Model.preventLazyLoading(enable = true)` sets the flag
- In `EagerLoader._getRelation()` (or wherever lazy loads are initiated via relation method calls), check the flag before returning the relation — **not** on `getResults()` itself, because the user might call `user.posts().where(...).get()` intentionally
- Actually: check in the **Proxy getter** on model instances. When a user accesses `user.posts` as a property (not a method call), that would trigger lazy loading. But our design uses explicit method calls (`user.posts().get()`), so lazy loading is always explicit.
- Best place: add a check at the start of `Relation.getResults()` — if `_preventLazyLoading` is true, throw `LazyLoadingViolationError`

**Files:**
- `src/model/Model.ts` — add static `_preventLazyLoading`, `preventLazyLoading(enable?)` method
- `src/model/relations/Relation.ts` — check flag in `getResults()` (abstract — each subclass calls this)
- `src/errors/LazyLoadingViolationError.ts` — custom error class

---

### Phase 9 — Serialization

**Why:** Every API project needs this. Gaps are immediately visible to users.

#### What's missing vs Eloquent:

**On Model instance:**
- `@visible(['col1', 'col2'])` decorator — allowlist (inverse of `@hidden`)
- `makeVisible(col | col[])` / `makeHidden(col | col[])` — temporary per-instance override, returns `this`
- `mergeVisible` / `mergeHidden` — add to existing list without replacing
- `setVisible` / `setHidden` — replace the entire list for this instance
- `@appends(['full_name'])` decorator — include computed accessor values in toArray/toJSON
- `append(col)` / `mergeAppends(cols)` / `setAppends(cols)` / `withoutAppends()` — runtime control of appended attrs
- `toArray()` — already have `toObject()`, rename/alias + include loaded relations recursively
- `attributesToArray()` — only attributes, no relations
- Relations auto-included in `toArray()` when loaded (currently `toObject()` ignores `_relations`)

**Files to create/modify:**
- `src/model/decorators/cast.ts` — add `@visible`, `@appends` decorators
- `src/model/ModelMetadata.ts` — add `visible: string[]`, `appends: string[]` fields
- `src/model/Model.ts` — add `makeVisible/Hidden/mergeVisible/mergeHidden/setVisible/setHidden`, `append/mergeAppends/setAppends/withoutAppends`, `toArray()` (= toObject with relations), `attributesToArray()`

**Key rule:** `toArray()` recursively serializes loaded relations. `attributesToArray()` is attributes only. `toJSON()` calls `toArray()`.

---

### Phase 9 — Accessors & Mutators

**Why:** Core Eloquent feature. Without it, computed properties and input transformation must be done outside the model.

#### What to build:

**Accessor** — computed read-only property (not in DB):
```ts
@table('users')
class User extends Model {
  @accessor
  get fullName(): string {
    return `${this.first_name} ${this.last_name}`;
  }
}
```
Or method-style:
```ts
protected fullName = accessor(() => `${this.first_name} ${this.last_name}`);
```

**Mutator** — transforms value before storing in `_attributes`:
```ts
@mutator
set password(value: string) {
  this._attributes.password = hash(value);
}
```

**TypeScript challenge:** ES decorators on getters/setters are limited. Best approach: use `defineProperty` in a decorator that intercepts the Proxy getter/setter.

**Custom Casts** — class-based:
```ts
class MoneyCast implements CastClass {
  get(value: unknown): Money { return new Money(value as number); }
  set(value: Money): unknown { return value.amount; }
}

@casts({ price: MoneyCast })
class Product extends Model {}
```

**Files to modify:**
- `src/model/decorators/cast.ts` — add `@accessor`, `@mutator` decorators
- `src/model/ModelMetadata.ts` — add `accessors: Map<string, Function>`, `mutators: Map<string, Function>`
- `src/model/Model.ts` — update Proxy handler to call accessors/mutators
- `src/model/ModelBuilder.ts` — `withCasts()` for query-time casting

---

### Phase 10 — Collection (Eloquent-specific methods)

**Why:** The `Collection<T>` we have is generic. Eloquent adds model-aware methods that are widely used.

#### What's missing:

```ts
// Model-aware lookups
users.find(1)                    // by PK → T | undefined
users.findOrFail(1)              // throws if not found
users.modelKeys()                // [1, 2, 3, 4] — PKs of all models
users.except([1, 2])             // exclude by PK
users.only([3, 4])               // include only by PK
users.diff(otherCollection)      // models NOT in other (by PK)
users.intersect(otherCollection) // models IN both (by PK)

// DB operations
users.fresh()                    // re-fetch all from DB (returns new Collection)
users.fresh('comments')          // re-fetch with eager loads
users.load('posts')              // eager load onto existing instances
users.loadMissing('posts')       // only if not already loaded
users.toQuery()                  // ModelBuilder with WHERE id IN (1,2,3)

// Visibility (delegate to each model)
users.makeVisible(['phone'])
users.makeHidden(['email'])
users.setVisible(['id', 'name'])
users.setHidden(['password'])
```

**Implementation note:** `Collection<T>` needs to know T is a Model to support PK-based methods. Best approach: subclass `Collection<T extends Model>` as `ModelCollection<T>` and return it from `ModelBuilder.get()`. Or add a `_modelClass` reference to Collection set at hydration time.

**Files to modify:**
- `src/model/Collection.ts` — add all methods above, or create `ModelCollection.ts`
- `src/model/ModelBuilder.ts` — return `ModelCollection<T>` from `get()`

---

### Phase 11 — Pagination

**Why:** Indispensable for any real API. Cannot ship v1.0 without it.

#### What to build:

```ts
// Full pagination (total count + pages)
const page = await User.where('active', true).paginate(15);
// returns: { data: Collection<User>, total: 100, perPage: 15, currentPage: 1,
//            lastPage: 7, from: 1, to: 15, hasMorePages: true }

// Simple pagination (no total count — faster)
const page = await User.simplePaginate(15);
// returns: { data: Collection<User>, perPage: 15, currentPage: 1, hasMorePages: true }

// Custom page number
await User.paginate(15, 3);  // page 3

// Named result type
type Paginator<T> = {
  data: Collection<T>;
  total: number;
  perPage: number;
  currentPage: number;
  lastPage: number;
  from: number;
  to: number;
  hasMorePages: boolean;
};
```

**Implementation:** `paginate` runs two queries: `COUNT(*)` + `SELECT ... LIMIT perPage OFFSET (page-1)*perPage`. `simplePaginate` runs one query: `LIMIT perPage+1 OFFSET ...` and checks if there's a next page by whether count > perPage.

**Files to create/modify:**
- `src/model/Paginator.ts` — `Paginator<T>` and `SimplePaginator<T>` types/classes
- `src/model/ModelBuilder.ts` — add `paginate(perPage, page?)` and `simplePaginate(perPage, page?)`
- `src/index.ts` — export `Paginator`, `SimplePaginator`

---

### Phase 12 — Factories

**Why:** Standard for testing and seeding. Big quality-of-life feature for users writing tests.

#### What to build:

```ts
// Define
class UserFactory extends Factory<User> {
  model = User;

  definition(): Record<string, unknown> {
    return {
      name:  faker.person.fullName(),
      email: faker.internet.email(),
    };
  }

  unverified() {
    return this.state({ email_verified_at: null });
  }
}

// Use
const user  = await User.factory().create();
const users = await User.factory().count(3).create();
const user  = await User.factory().state({ is_admin: true }).make(); // unsaved
const users = await User.factory().count(5).sequence(
  { role: 'admin' },
  { role: 'editor' },
).create();

// Relationships
const user = await User.factory()
  .has(Post.factory().count(3))
  .create();

const post = await Post.factory()
  .for(User.factory())
  .create();
```

**Files to create:**
- `src/factory/Factory.ts` — abstract base class with `definition()`, `make()`, `create()`, `count()`, `state()`, `sequence()`, `has()`, `for()`, `afterMaking()`, `afterCreating()`
- `src/factory/Sequence.ts` — `Sequence` class for cycling attribute arrays
- `src/model/Model.ts` — static `factory()` method that resolves the associated Factory class
- `src/index.ts` — export `Factory`, `Sequence`

**Faker:** Users bring their own faker (e.g. `@faker-js/faker`). Factory does not depend on it directly — `definition()` is user-implemented.

---

### Phase 13 — MySQL Driver ✅ COMPLETE

After all model-layer features are complete, add the second database driver.

**What to build:**
- `src/connection/adapters/MySQLAdapter.ts` — uses `mysql2` pool, nested transactions via `SAVEPOINT`
- `src/query/grammars/MySQLQueryGrammar.ts` — `?` positional params (not `$1/$2`), backtick quoting
- `src/schema/grammars/MySQLSchemaGrammar.ts` — MySQL-specific DDL (AUTO_INCREMENT, ENGINE=InnoDB, etc.)
- Update `ConnectionManager` to instantiate `MySQLAdapter` when `driver: 'mysql'`
- Update `orion.config.js` docs for MySQL config

---

### Phase 14 — SQLite Driver ✅ COMPLETE

- `src/connection/adapters/SQLiteAdapter.ts` — uses `better-sqlite3` (sync) wrapped as async
- `src/query/grammars/SQLiteQueryGrammar.ts` — `?` params, double-quote identifiers
- `src/schema/grammars/SQLiteSchemaGrammar.ts` — limited ALTER TABLE, no foreign key DDL inline

---

### Phase 15 — API Resources ✅ COMPLETE

Transformation layer between models and API responses. Lower priority — can be done in userland.

```ts
class UserResource extends Resource<User> {
  toArray(request?: unknown): Record<string, unknown> {
    return {
      id:    this.resource.id,
      name:  this.resource.name,
      posts: PostResource.collection(this.resource.getRelation('posts')),
    };
  }
}
```

---

### Phase 19 — Model Convenience Methods ✅ COMPLETE

---

### Phase 19 — Model Convenience Methods (HIGH PRIORITY) [ARCHIVED]

Filling in the most-used Model methods that are missing.

**`src/model/Model.ts`:**
- `fresh(): Promise<this | null>` — re-fetch from DB, returns new instance
- `refresh(): Promise<this>` — re-hydrate in-place + reload loaded relations
- `replicate(except?: string[]): this` — unsaved copy (excludes pk, timestamps)
- `firstOrCreate(attrs, values?)` / `firstOrNew(attrs, values?)` — static
- `updateOrCreate(attrs, values)` — static
- `findOr(id, callback)` / `firstOr(callback)` — static + instance
- `saveOrFail()` / `deleteOrFail()` / `updateOrFail(attrs)` — transaction-wrapped
- `destroy(...ids)` — static bulk delete by PK (fires events per model)
- `forceDestroy(...ids)` — static bulk force-delete
- `upsert(rows[], uniqueBy[], update?)` — bulk upsert
- `wasRecentlyCreated: boolean` — set to true after `create()`
- `getOriginal(attr?)` — value before any dirty changes
- `getChanges()` — attrs changed in last save
- `getPrevious()` — values before last save
- `increment(col, amount?)` / `decrement(col, amount?)` — atomic
- `is(model)` / `isNot(model)` — PK + table comparison
- `static withoutTimestamps(callback)` — disable timestamp in closure
- `preventSilentlyDiscardingAttributes(enable?)` — strict mass-assign mode
- `_defaults: Record<string, unknown>` — default attribute values

**`src/model/ModelBuilder.ts`:**
- `withoutGlobalScope(ScopeClass | name)` / `withoutGlobalScopes(scopes?)` — remove per-query
- `chunk(size, callback)` / `chunkById(size, callback, col?)` — large result processing
- `cursor()` — async generator, one model at a time
- `lazy(size?)` / `lazyById(size?, col?)` — async generator in batches

---

### Phase 20 — Relations: Save/Create/Touch/Pivot Extras ✅ COMPLETE

---

### Phase 20 — [ARCHIVED]

**On all `Relation<T>` subclasses:**
- `save(model): Promise<T>` — associate + save
- `saveMany(models[]): Promise<T[]>`
- `create(attrs): Promise<T>` — new related + save
- `createMany(attrs[]): Promise<T[]>`

**On `BelongsTo<T>`:**
- already has `associate`/`dissociate` ✅

**On `BelongsToMany<T>` and `MorphToMany<T>`:**
- `syncWithPivotValues(ids, pivotValues)` — sync with fixed pivot
- `updateExistingPivot(id, attrs)` — update pivot row
- `withTimestamps()` — add `created_at`/`updated_at` to pivot

**Model-level:**
- `_touches: string[]` property — auto-touch parent on save
- `touch(relation?)` — update `updated_at` on related parent(s)

**`ModelBuilder` + relations:**
- `whereAttachedTo(model)` / `orWhereAttachedTo(model)` — BelongsToMany filter
- `whereMorphedTo(relation, model)` / `whereNotMorphedTo(relation, model)`
- `orWhereRelation(relation, col, op, val)` / `whereMorphRelation(...)` / `orWhereMorphRelation(...)`

---

### Phase 21 — ModelCollection Extras ✅ COMPLETE

---

### Phase 21 — [ARCHIVED]

**`src/model/ModelCollection.ts`:**
- `append(attrs)` — call `append` on each model
- `contains(pkOrModel)` — check by PK
- `setAppends(attrs)` — override appends on each model
- `withoutAppends()` — clear appends on each model
- `mergeVisible(attrs)` / `mergeHidden(attrs)` — add to existing lists
- `partition(fn)` — returns `[ModelCollection<T>, ModelCollection<T>]`
- `unique()` — deduplicate by PK
- `loadCount(relations)` / `loadSum(...)` / `loadMin(...)` / `loadMax(...)` / `loadAvg(...)` — on collection
- `toResourceCollection()` — convenience method

---

### Phase 22 — Casting Enhancements ✅ COMPLETE

---

### Phase 22 — [ARCHIVED]

**`src/model/Model.ts`:**
- `mergeCasts(attrs)` — add casts at runtime (merges with class-defined casts)
- `serializeDate(date)` — override for custom date serialization format

**New cast types in `src/model/decorators/cast.ts`:**
- `'decimal:<n>'` — stored as number, serialized with precision
- `'hashed'` — one-way hash on set (bcrypt/sha)
- `'immutable_date'` / `'immutable_datetime'` — date as readonly value
- `'json:unicode'` — JSON without escaped unicode
- `'AsStringable'` — wraps in a Stringable helper
- `'encrypted'` / `'encrypted:array'` etc. — encrypt/decrypt (user-provided cipher)

**Interfaces:**
- `Castable` — value objects with `castUsing(): CastClass` static method
- `CastsInboundAttributes` — cast with only `set()`, no `get()`
- `ComparesCastableAttributes` — custom `compare(a, b): boolean`
- Cast parameters — `SomeCast:param1,param2` parsed in cast registry

**Accessor/Mutator:**
- Accessor caching — `shouldCache()` option
- `withoutObjectCaching()` — opt-out of reference caching

---

### Phase 23 — API Resource Enhancements ✅ COMPLETE

---

### Phase 23 — [ARCHIVED]

**`src/resources/Resource.ts`:**
- `whenHas(attr)` — include if attribute exists on model
- `whenNotNull(value)` — include if not null
- `whenCounted(relation)` — include `{relation}_count` if loaded
- `whenAggregated(relation, col, fn)` — include aggregate if loaded
- `whenPivotLoaded(table, fn)` / `whenPivotLoadedAs(as, table, fn)` — conditional pivot
- `additional(data)` — merge top-level meta at runtime
- `with(request)` — top-level meta method (override in subclass)
- `paginationInformation(request, paginated, default)` — customize pagination meta
- `static withoutWrapping()` — disable `data` key wrapping globally
- `response()` — return with custom HTTP headers
- `withResponse(request, response)` — lifecycle hook for response customization

**`src/model/Model.ts` + `ModelCollection.ts`:**
- `toResource(ResourceClass?)` — auto-discover and return Resource instance
- `toResourceCollection(CollectionClass?)` — collection variant

**New decorators:**
- `@UseResource(ResourceClass)` — bind resource class to model
- `@UseResourceCollection(CollectionClass)` — bind collection resource

---

### Phase 24 — Factory Enhancements ✅ COMPLETE

---

### Phase 24 — [ARCHIVED]

**`src/factory/Factory.ts`:**
- `configure(): this` — define `afterMaking`/`afterCreating` inside factory class
- `trashed(): Factory<T>` — built-in state for soft-deleted models
- `hasAttached(factory, pivotAttrs?)` — M:M with pivot attributes
- `recycle(model | Collection)` — reuse existing related model across relationships
- Magic `has{Relation}()` / `for{Relation}()` proxy methods (dynamic dispatch)

---

### Phase 25 — UUID/ULID & Pruning ✅ COMPLETE

---

### Phase 25 — [ARCHIVED]

**`src/model/concerns/HasUuids.ts`** + **`HasUlids.ts`:**
- Mixin that auto-generates UUID v7 / ULID as PK before insert
- `newUniqueId()` — override generation
- `uniqueIds()` — specify which columns get UUIDs

**`src/model/concerns/Prunable.ts`** + **`MassPrunable.ts`:**
- Abstract `prunable(): ModelBuilder<T>` method
- `pruning(): void` hook (called before delete)
- CLI command `orion model:prune`

---

### Phase 26 — Dynamic Relations & Scoped Relationships ✅ COMPLETE

---

### Phase 26 — [ARCHIVED]

- `Model.resolveRelationUsing(name, closure)` — runtime relation registration
- `withAttributes(attrs, asConditions?)` — pre-populated scoped relation
- `chaperone()` on hasMany / morphMany — auto-hydrate parent reference on children

---

### Phase 27 — JSON:API Resources ✅ COMPLETE

---

### Phase 27 — [ARCHIVED]

Full JSON:API spec-compliant resources. New in Eloquent 13.

**`src/resources/JsonApiResource.ts`:**
- `$attributes` / `$relationships` declarative arrays
- `toAttributes(request)` / `toRelationships(request)` overrides
- Sparse fieldsets (`fields[type]=attr1,attr2`)
- `include` query param support with nested depth limit
- `toLinks()` / `toMeta()` overrides
- `toType()` / `toId()` overrides
- `ignoreFieldsAndIncludesInQueryString()`
- `includePreviouslyLoadedRelationships()`
- `JsonApiResource.maxRelationshipDepth(n)`

---

## Gap Audit vs Eloquent 13.x — 2026-06-06 (Second Pass)

> Audit completo contra a documentação oficial: Getting Started, Relationships, Collections, Mutators & Casting, API Resources, Serialization, Factories.

### ✅ Implementado nesta sessão (2026-06-06, segundo pass)

| Feature | Arquivo(s) |
|---------|-----------|
| `wherePivotNotIn()` | `BelongsToMany.ts`, `MorphToMany.ts` |
| `wherePivotBetween()` / `wherePivotNotBetween()` | `BelongsToMany.ts`, `MorphToMany.ts` |
| `orderByPivotDesc()` | `BelongsToMany.ts`, `MorphToMany.ts` |
| `syncWithoutDetaching()` | `BelongsToMany.ts`, `MorphToMany.ts` |
| `whereBelongsTo()` / `orWhereBelongsTo()` | `ModelBuilder.ts` |
| `orWhereMorphedTo()` | `ModelBuilder.ts` |
| `firstOrCreate()` / `updateOrCreate()` em relação | `HasMany.ts`, `MorphMany.ts` |
| `Sequence.index` + closure support | `Sequence.ts`, `Factory.ts` |

---

### ✅ Tudo implementado (confirmado neste audit)

| Área | Feature |
|------|---------|
| Model | `isClean()`, `fill()`, `isDirty()`, `wasChanged()`, `getOriginal()`, `getChanges()`, `getPrevious()` |
| Model | `@table({ connection })` — conexão por model |
| Model | `wherePivotNull`, `wherePivotNotNull`, `wherePivotIn` |
| Model | `updateOrCreate`, `firstOrCreate`, `firstOrNew` (estáticos) |
| Fase 22 | `mergeCasts()`, `serializeDate()`, cast types extensos |
| Fase 25 | `HasUuids`, `HasUlids`, `Prunable`, `MassPrunable` |
| Fase 26 | `resolveRelationUsing`, `withAttributes`, `chaperone()` |
| Fase 27 | `JsonApiResource` completo (sparse fieldsets, includes, links/meta) |

---

### ❌ Gaps restantes após segundo pass — ordenados por prioridade

> Itens 1–6 do audit original já foram implementados (ver tabela ✅ acima). Os gaps abaixo são os que permanecem abertos.

#### PRIORIDADE MÉDIA (casts avançados)

| # | Feature | Onde | Notas |
|---|---------|------|-------|
| 1 | `AsArrayObject` cast class | `src/model/decorators/cast.ts` | Wraps JSON em objeto mutável |
| 2 | `AsCollection` cast class (com `.using()` e `.of()`) | `src/model/decorators/cast.ts` | Versão class-based do cast `collection` |
| 3 | `AsEnumCollection` / `AsEnumArrayObject` | `src/model/decorators/cast.ts` | Array de enums castado |
| 4 | `AsBinary` cast (UUID/ULID em binário) | `src/model/decorators/cast.ts` | Para colunas binary uuid/ulid |
| 5 | `AsUri` cast | `src/model/decorators/cast.ts` | Wraps em objeto URI/URL |
| 6 | `AsFluent` cast | `src/model/decorators/cast.ts` | Wraps em objeto fluent |
| 7 | `SerializesCastableAttributes` interface | `src/model/decorators/cast.ts` | Interface para serialização customizada do value object |

#### PRIORIDADE MÉDIA (collections e relações)

| # | Feature | Onde | Notas |
|---|---------|------|-------|
| 8 | `@CollectedBy(CollectionClass)` decorator / `newCollection()` | `src/model/decorators/` | Custom collection por model |
| 9 | `morphWithCount()` no eager load de `MorphTo` | `src/model/EagerLoader.ts` | `morphTo` com withCount de tipos polimórficos |
| 10 | `loadMorphCount('relation', { TypeA: ['rel1'], TypeB: ['rel2'] })` | `src/model/Model.ts` + `ModelCollection.ts` | Aggregates polimórficos lazy |
| 11 | Relation `one()` — converte `HasMany` em `HasOne` | `src/model/relations/HasMany.ts` | `user.posts().one().ofMany('price', 'max')` |
| 12 | Custom Pivot Model — `belongsToMany(Role).using(RoleUser)` | `BelongsToMany.ts`, `MorphToMany.ts`, `MorphedByMany.ts` | `PivotRecord` precisa ser base class extensível; relação precisa de `using(Class)` |

#### PRIORIDADE BAIXA (ergonomia / Eloquent 13.x específico)

| # | Feature | Onde | Notas |
|---|---------|------|-------|
| 13 | Pending Attributes em local scopes | `src/model/ModelBuilder.ts` | Scope que pre-popula attrs via `withAttributes` |
| 14 | `withRelationshipAutoloading()` na Collection | `src/model/ModelCollection.ts` | Auto eager load — novo no Eloquent 13.x |
| 15 | `Model.isAutomaticallyEagerLoadingRelationships()` | `src/model/Model.ts` | Static flag para auto eager loading |
| 16 | `@UseFactory` decorator no Model / `@UseModel` no Factory | decorators | Atualmente usamos `_factory` static prop |
| 17 | `through()` fluent builder no Model | `src/model/Model.ts` + relations | `this.through('environments').has('deployments')` e magic `throughEnvironments().hasDeployments()` |
| 18 | `_withCount: string[]` property (auto eager count) | `src/model/Model.ts` + `EagerLoader.ts` | Counts eager loading automático declarado na classe |
| 19 | `#[PreserveKeys]` / `#[Collects]` decorators na Resource | `src/resources/` | Atualmente só temos via propriedade |
| 20 | `getMorphedModel(alias)` estático | `src/model/MorphMap.ts` | `Relation.getMorphedModel('post')` → classe; wrapper sobre `MorphMap` |

---

## Gap Audit vs Eloquent 13.x — 2026-06-06 (Third Pass)

> Audit realizado contra as mesmas 7 páginas de documentação do Eloquent 13.x (Getting Started, Relationships, Collections, Mutators & Casting, API Resources, Serialization, Factories) + revisão do GitHub `illuminate/database`.
> Last updated: 2026-06-06

### ✅ Confirmado como implementado (terceiro pass)

| Área | Feature verificada |
|------|--------------------|
| ModelBuilder | `orWhereRelation()` ✅ (linha 845) |
| ModelBuilder | `whereAttachedTo()` / `orWhereAttachedTo()` ✅ |
| ModelBuilder | `orWhereMorphedTo()` ✅ |
| BelongsToMany | `syncWithoutDetaching()`, `wherePivotNotIn()`, `wherePivotBetween()`, `wherePivotNotBetween()`, `orderByPivotDesc()` ✅ |
| Factory | `Sequence.$index`, closure support ✅ |
| Serialization | `toArray()`, `attributesToArray()`, `toJSON()`, `makeVisible/Hidden`, `mergeVisible/Hidden`, `setVisible/Hidden`, `append/mergeAppends/setAppends/withoutAppends` ✅ |
| Collections | `append`, `contains`, `diff`, `except`, `find`, `findOrFail`, `fresh`, `intersect`, `load`, `loadMissing`, `modelKeys`, `makeVisible/Hidden`, `mergeVisible/Hidden`, `only`, `partition`, `setAppends`, `setVisible/Hidden`, `toQuery`, `unique`, `withoutAppends` ✅ |

### ❌ Novos gaps encontrados no terceiro pass

| # | Feature | Onde | Prioridade | Notas |
|---|---------|------|-----------|-------|
| N1 | Custom Pivot Model — `using(PivotClass)` | `BelongsToMany.ts`, `MorphToMany.ts`, `MorphedByMany.ts` | MÉDIA | Eloquent permite `belongsToMany(Role).using(RoleUser)` onde `RoleUser extends Pivot`. Nosso `PivotRecord` é só um data holder; precisa virar base class extensível + `using()` nas relações |
| N2 | `incrementing` flag em pivot model | `BelongsToMany.ts` + `PivotRecord.ts` | BAIXA | `#[Table(incrementing: true)]` no Eloquent permite pivot com PK auto-increment; ignoramos PK do pivot por padrão |
| N3 | `getMorphedModel(alias)` estático | `src/model/MorphMap.ts` | BAIXA | `Relation::getMorphedModel('post')` → classe registrada. Já temos `MorphMap.getClass()` — só falta expor como `Relation.getMorphedModel()` para compatibilidade com a API do Eloquent |

### Checklist completo de gaps abertos (combinado segundo + terceiro pass)

> Use este checklist para priorizar o trabalho futuro. ✅ = implementado, ❌ = aberto.

#### Casts avançados
- [ ] `AsArrayObject` — wraps JSON em objeto mutável com dirty tracking
- [ ] `AsCollection` — versão class-based do cast `collection`, com `.using()` e `.of()`
- [ ] `AsEnumCollection` / `AsEnumArrayObject` — arrays de enums castados
- [ ] `AsBinary` — UUID/ULID armazenados em binário
- [ ] `AsUri` — wraps valor em objeto URI/URL
- [ ] `AsFluent` — wraps valor em objeto fluent
- [ ] `SerializesCastableAttributes` interface — serialização customizada do value object

#### Collections e relações
- [ ] `@CollectedBy(CollectionClass)` decorator + `newCollection()` override no Model
- [ ] `morphWithCount()` no eager loading de `MorphTo` (EagerLoader)
- [ ] `loadMorphCount('relation', { TypeA: ['rel1'], TypeB: ['rel2'] })` em Model + ModelCollection
- [ ] `one()` em HasMany/HasManyThrough — converte em HasOne para uso com `ofMany/latestOfMany`
- [ ] **Custom Pivot Model** — `using(PivotClass)` em BelongsToMany/MorphToMany/MorphedByMany + `PivotRecord` como base extensível

#### Ergonomia / Eloquent 13.x específico
- [ ] `withRelationshipAutoloading()` na Collection (auto eager load global)
- [ ] `Model.isAutomaticallyEagerLoadingRelationships()` static flag
- [ ] `@UseFactory` no Model / `@UseModel` no Factory (atualmente: `_factory` static prop)
- [ ] `through()` fluent no Model + magic `throughX().hasY()` para HasOneThrough/HasManyThrough
- [ ] `_withCount: string[]` property declarativa na classe (auto eager count no boot)
- [ ] `@PreserveKeys` / `@Collects` decorators na Resource
- [ ] `getMorphedModel(alias)` estático (wrapper fino sobre `MorphMap.getClass()`)
- [ ] `incrementing` flag em pivot models

---

## Roadmap de Infra & Qualidade

> Adicionado 2026-06-06. Itens independentes dos gaps de feature Eloquent.

### ✅ Concluído

| Item | Detalhes |
|------|---------|
| Documentação completa | `README.md` + 14 páginas em `docs/` (estilo Laravel) |
| Examples | `examples/` com models, migrations, factories, resources e 6 arquivos de uso |
| Connection via URL | `parseConnectionUrl()` + `ConnectionManager.addConnectionUrl()` |
| Pacote npm preparado | `@wrsouza/orion`, `publishConfig`, `files`, `exports`, `sideEffects` |
| GitHub Actions — CI | `.github/workflows/ci.yml` — type-check + build em Node 18/20/22 |
| GitHub Actions — Publish | `.github/workflows/publish.yml` — publica no npm ao criar uma Release |

### ⏳ Próximos passos (em ordem)

| # | Item | Status | Notas |
|---|------|--------|-------|
| 1 | **ESLint + Prettier** | 🔄 em andamento | `@typescript-eslint`, `prettier`, `eslint-config-prettier`, `.eslintrc.json`, `.prettierrc` |
| 2 | **Husky + lint-staged** | 🔄 em andamento | pre-commit → lint-staged (ESLint+Prettier nos staged); pre-push → tsc + build |
| 3 | **Testes — Unit** | ⬜ pendente | Jest + ts-jest; sem DB; cobre: parseConnectionUrl, query builder SQL, casting, dirty tracking, serialização |
| 4 | **Testes — Integration** | ⬜ pendente | SQLite `:memory:`; cobre: CRUD, relations, scopes, soft delete |
| 5 | **CI — testes** | ⬜ pendente | Atualizar `ci.yml` para rodar `npm test` após o build |

### Estratégia de testes (para referência ao implementar)

```
tests/
├── unit/
│   ├── connection-url.test.ts       — parseConnectionUrl (todos os drivers)
│   ├── query-builder.test.ts        — geração de SQL por dialect
│   ├── model-casting.test.ts        — todos os cast types
│   ├── model-dirty.test.ts          — isDirty, wasChanged, getOriginal, getPrevious
│   └── model-serialization.test.ts  — toArray, hidden, visible, appends
└── integration/
    ├── setup.ts                     — SQLite :memory: + Schema inline (sem migrations CLI)
    ├── model-crud.test.ts           — create, find, findOrFail, update, delete, upsert
    ├── model-relations.test.ts      — hasMany, belongsTo, belongsToMany, eager loading
    ├── model-scopes.test.ts         — global/local scopes, withoutGlobalScopes
    └── model-soft-delete.test.ts    — delete, restore, forceDelete, withTrashed
```

**Stack de teste:** `jest` + `ts-jest` + `better-sqlite3` (já em optionalDependencies).
Todos os testes de integração usam SQLite `:memory:` — zero config, zero Docker, roda no CI.

---

## Key Design Decisions (do not change without strong reason)

| Decision | Rationale |
|---|---|
| SQL builder from scratch (no Knex) | Full control over dialect, no hidden deps |
| `ModelBuilder<T>` via composition, not extends `QueryBuilder` | TypeScript covariant return type conflict |
| `Relation<T>` extends `ModelBuilder<T>` | Relations are chainable builders |
| Dirty tracking via `Proxy` | Transparent to user, no per-property decorators |
| Eager loading via `WHERE fk IN (ids)` | Matches Eloquent strategy, prevents N+1 |
| FK inferred from class name convention | `hasMany(Post)` → `post_id`, pivot → `role_user` |
| Lazy loading = explicit async call | No async getters in JS |
| `@scope` uses runtime Proxy on `query()` | Local scopes callable without static method per scope |
| `SoftDeletes` as TypeScript mixin | Composable without changing inheritance chain |
| `EventDispatcher` per class in ModelMetadata | Events are class-scoped, not shared with parent |
| `MorphMap` static registry | Alias resolution is global, not per-relation |

---

## Project Config

- **Language**: TypeScript 5.4, target ES2022, CommonJS
- **Runtime deps**: `pg` only (for now)
- **`experimentalDecorators`**: true, `emitDecoratorMetadata`: true
- **Config file**: `orion.config.js` in project root
- **CLI binary**: `npx orion <command>`
- **Build**: `npm run build` → `dist/`
- **Type check**: `npx tsc --noEmit` (must pass with zero errors before ending any session)
