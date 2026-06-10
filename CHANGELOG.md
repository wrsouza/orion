# Changelog

All notable changes to orion are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
orion adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

#### `Cast` enum
- New `Cast` object exported from `@wrsouza/orion` with named constants for all built-in cast types: `Cast.Number`, `Cast.String`, `Cast.Boolean`, `Cast.Json`, `Cast.Date`, `Cast.Array`, `Cast.Hashed`, `Cast.Encrypted`, `Cast.EncryptedArray`, `Cast.EncryptedJson`, `Cast.ImmutableDate`, `Cast.ImmutableDatetime`, `Cast.JsonUnicode`, `Cast.AsStringable`, `Cast.Decimal(n)`
- Eliminates raw string literals in cast declarations — IDE autocomplete and typo safety
- Accepted by both `@casts({})` and the new `@cast()` property decorator

#### `@cast()` property decorator
- New property-level decorator for per-field cast declarations alongside `@map()`
- Accepts `Cast.*` values, `Cast.Decimal(n)`, or any custom `CastClass` / `Castable` constructor
- Property-level declarations are merged on top of class-level `@casts` — property wins on conflict

#### `@hidden()` property decorator
- `@hidden` now works as both a class decorator (`@hidden(['password'])`) and a property decorator (`@hidden()`)
- The property form hides individual fields without listing them all at the class level

---

## [0.2.0] — 2026-06-08

### Added

#### Centralised configuration — `createConnection()`
- New `createConnection(config: OrionConfig)` function as the single entry point for
  bootstrapping connection, morph map, and lazy-loading guard in one call
- Accepts `connection` as a URL string or a full `ConnectionConfig` object
- Optional `morphs`, `preventLazyLoading`, `migrations`, and `seeders` fields
- The CLI auto-detects `src/database.ts`, `database.ts`, `src/orion.ts` in addition
  to the legacy `orion.config.*` files

#### CLI improvements
- `--config <path>` flag for non-standard config file locations
- CLI auto-registers `ts-node` from the project's `node_modules` — `npx orion migrate`
  works out of the box without wrapper scripts
- `db:seed [--class=Name]` — run seeders; falls back to alphabetical order when no
  `DatabaseSeeder` entry point is found
- `make:seed <name>` — scaffold a seeder file
- `make:factory <name>` — scaffold a factory file
- Fixed `make:migration` templates: import now uses `@wrsouza/orion` instead of `orion`

#### Seeds
- `Seeder` abstract base class with `run()` and `call([...seeders])` for chaining
- Seeder and factory paths are derived from the migrations path (same `src/database/` base)

#### `@map('column_name')` decorator
- Maps a model property to a different DB column name (camelCase ↔ snake_case)
- Transparent read/write via Proxy (`user.createdAt` ↔ `created_at` column)
- `fill()`, `isDirty()`, `wasChanged()`, `getOriginal()`, `getPrevious()`,
  `getChanges()` all accept property names
- `attributesToArray()` / `toJSON()` outputs property names
- `ModelBuilder.where/orderBy/groupBy/select/having` translate property names to
  column names automatically

#### `.primary()` column modifier
- Fluent inline `PRIMARY KEY` on any column type: `table.uuid('id').primary()`
- Replaces the two-step `table.uuid('id') + table.primary('id')` pattern
- Supported in all five grammar dialects (Postgres, MySQL, MariaDB, SQLite, SQL Server)

#### `foreignId` / `foreignUuid` fluent FK chaining
- Both methods now create the column **and** register a `ForeignKeyDefinition`
  for chaining: `table.foreignUuid('user_id').references('id').on('users').onDelete('CASCADE')`

#### `Model.with()` static shortcut
- `User.with('posts').get()` works directly without `User.query().with('posts')`
- `ModelBuilder.first()` now applies eager loads (previously only `get()` did)

#### Migration transactions
- Each `up()` and `down()` now runs inside a database transaction
- On failure, the table is fully rolled back and the migration is never logged as ran
- Postgres, SQLite, SQL Server: complete DDL rollback; MySQL/MariaDB: DDL implicit commit
  but migration state is never corrupted

### Fixed
- `ModelSubclass` index signature removed — user model classes no longer require
  `[key: string]: unknown` in strict TypeScript mode (ts(2684))
- `OrmConfig` in CLI previously accepted only `driver: 'postgres'`; now uses the full
  `ConnectionConfig` supporting all five drivers
- Husky hooks missing `#!/bin/sh` shebang on Windows

## [0.3.1] — 2026-06-08

### Fixed

- **`@map` decorator ignored on `Model.create()`** — `newInstance()` was copying
  attributes directly into `_attributes` without applying the `columnMap`, so
  camelCase property names (e.g. `publishedAt`) were sent to the database instead
  of the mapped column name (`published_at`), causing
  `column "publishedAt" does not exist` errors when using factories or
  `Model.create({ publishedAt: ... })`. `newInstance()` now translates keys
  through `columnMap` before storing them.

## [0.2.1] — 2026-06-08

### Fixed

- Lazy-load driver packages in adapters — `mysql2`, `mariadb`, `mssql` and
  `better-sqlite3` are now `require()`d inside the constructor instead of at
  module load time. Projects that only install `pg` no longer fail with
  `Cannot find module 'mysql2/promise'` on startup.

## [Unreleased]

---

## [0.3.3] — 2026-06-09

### Added

- **`BelongsToMany.withoutPivot()`** — hides the `pivot` record from `toArray()` / `toJSON()`
  serialization while keeping it accessible at runtime via `model.pivot`. Use it in the
  relation definition to suppress the pivot from every response:
  ```ts
  categories(): BelongsToMany<Category> {
    return this.belongsToMany(Category, 'category_post', 'post_id', 'category_id')
               .withoutPivot();
  }
  ```

### Fixed

- **`toArray()` now honours `toJSON()` on non-Model relation values** — objects stored in
  `_relations` that are not a `Model` or `Collection` (e.g. `PivotRecord`) now have their
  `toJSON()` called during serialization; if `toJSON()` returns `undefined` the key is
  omitted from the output entirely.

---

## [0.3.2] — 2026-06-09

### Fixed

- **`BelongsToMany` eager load returns empty array** — `match()` was reading
  `_attributes['pivot_<fk>']` to group related models back to their parents, but
  `get()` had already moved all pivot columns out of `_attributes` into a
  `PivotRecord` stored in `_relations['pivot']`. The FK was therefore `undefined`
  and no related models were ever assigned. Fixed by reading the FK from
  `PivotRecord.get(foreignPivotKey)` instead.

---

## [0.3.0] — 2026-06-08

### Added

#### Phase 27 — JSON:API Resources
- `JsonApiResource<T>` abstract base class for JSON:API 1.1 spec-compliant resources
- Declarative API: `$type`, `$attributes`, `$relationships` properties
- Override hooks: `toId()`, `toType()`, `toAttributes()`, `toRelationships()`, `toLinks()`, `toMeta()`
- Sparse fieldsets support via `fields[type]=attr1,attr2` in `JsonApiRequestContext`
- `include` query param support with recursive nested resolution
- `JsonApiResource.maxRelationshipDepth(n)` — global depth cap (default: 3)
- `includePreviouslyLoadedRelationships()` — auto-include all loaded `_relations`
- `ignoreFieldsAndIncludesInQueryString()` — produce deterministic output (useful in tests)
- `JsonApiCollectionResource<T, R>` — wraps arrays for collection documents with `meta()`, `links()`, `toResponse()`
- Full TypeScript types: `JsonApiDocument`, `JsonApiResourceObject`, `JsonApiRelationshipObject`, `JsonApiResourceIdentifier`, `JsonApiRequestContext`

#### Phase 26 — Dynamic Relations & Scoped Relationships
- `Model.resolveRelationUsing(name, closure)` — register a relation closure at runtime without modifying the class; stored in `ModelMetadata.dynamicRelations`; discoverable by `has()`/`whereHas()`/eager loading
- `Relation.withAttributes(attrs, asConditions?)` — scope a relation with pre-populated values; when `asConditions = true` (default) applies WHERE constraints and merges into `create()`; when `false` only applies on write
- `chaperone()` on `HasMany` and `MorphMany` — after loading, each child has the parent stored in `_relations['parent']`; works for both lazy (`getResults()`) and eager (`match()`) load

#### Phase 25 — UUID/ULID & Pruning
- `HasUuids` mixin — auto-generates UUID v4 via `crypto.randomUUID()` before INSERT; `newUniqueId()` override; `uniqueIds()` for multiple columns
- `HasUlids` mixin — auto-generates ULID (26-char, lexicographically sortable) before INSERT; compact built-in generator using `crypto.randomFillSync`, no external dep
- `Prunable` mixin — `prunable()` method returns scoped builder; `pruning()` hook per row; `static pruneAll(chunkSize?)` iterates in chunks firing model events
- `MassPrunable` mixin — `prunable()` + `static pruneAll()` executing a single bulk DELETE (no events)
- CLI `model:prune [--model=ModelName] [--chunk=N]` — discovers prunable models in compiled models directory and calls `pruneAll()` on each

#### Phase 24 — Factory Enhancements
- `Factory.configure()` — override in subclass to register `afterMaking`/`afterCreating` hooks declaratively; called in constructor
- `Factory.trashed()` — applies `{ deleted_at: new Date() }` state for soft-deleted models
- `Factory.hasAttached(factory, pivotAttrs?, relation?)` — creates BelongsToMany related models and attaches them via `attach()` after parent creation
- `Factory.recycle(models)` — feeds a pool of existing models to reuse in `for`/`belongsTo` resolution instead of creating new records
- Magic `has{Relation}(factory)` / `for{Relation}(factory)` proxy methods — infer relation name from method name (e.g. `.hasPosts(Post.factory())`)

#### Phase 23 — API Resource Enhancements
- `Resource.whenNotNull(value)` — include key only when value is not null/undefined
- `Resource.whenHas(attribute)` — include key only if attribute exists on the model
- `Resource.whenCounted(relation)` — include `{relation}_count` only if loaded via `withCount()`
- `Resource.whenAggregated(relation, col, fn)` — include aggregate only if loaded
- `Resource.whenPivotLoaded(table, callback)` / `whenPivotLoadedAs(alias, table, callback)` — conditional pivot attributes
- `Resource.additional(data)` — merge top-level meta into `toResponse()`
- `Resource.with()` — override for static top-level meta
- `Resource.withResponse(request, response)` — lifecycle hook before returning response
- `Resource.response(request?)` — returns `ResourceResponse` with `data` + `headers`
- `Resource.withoutWrapping()` — static; disables `data` envelope globally
- `ResourceCollection.paginationInformation(request, paginated)` — override to customise pagination meta block
- `ResourceCollection.with()`, `withResponse()`, `response()` — matching API to `Resource`
- `ResourceResponse` class — carries `data` and `headers` together
- `Model.toResource(ResourceClass?)` — wraps model in a resource; auto-discovers via `@UseResource`
- `ModelCollection.toResourceCollection(CollectionClass?)` — respects `@UseResourceCollection` binding
- `@UseResource(ResourceClass)` decorator — binds resource class to model in `ModelMetadata`
- `@UseResourceCollection(CollectionClass)` decorator — binds collection resource class

#### Phase 22 — Casting Enhancements
- `Model.mergeCasts(casts)` — merges additional casts at runtime without replacing class-level definitions
- `Model.serializeDate(date)` — override to control Date serialization format in `toArray()`/`toJSON()`
- `Model.withoutObjectCaching()` — disables per-instance accessor result caching
- New primitive cast types: `decimal:<n>`, `hashed` (SHA-256 write-only), `immutable_date` / `immutable_datetime`, `json:unicode`, `AsStringable`, `encrypted` / `encrypted:array` / `encrypted:json`
- `CastsInboundAttributes` interface — write-only casts with only `set()`
- `Castable` / `CastableConstructor` interfaces — value objects with `static castUsing()` method
- `ComparesCastableAttributes` interface — `compare(a, b)` for custom dirty-check equality
- `CastClass.shouldCache?()` — opt-in result caching per attribute per instance
- `CastClass.get(value, params?)` / `set(value, params?)` now accept optional params array
- `Model._cipher` static property — `CipherContract` implementation for encrypted casts
- `CipherContract` interface — `encrypt(value)` / `decrypt(value)`
- `Stringable` helper class — fluent string wrapper (`upper`, `lower`, `trim`, `slug`, `contains`, `startsWith`, `endsWith`, `length`)

#### Phase 21 — ModelCollection Extras
- `ModelCollection.contains(pkOrModel)` — check presence by PK or model instance
- `ModelCollection.unique()` — deduplicate by PK, first occurrence wins
- `ModelCollection.partition(predicate)` — split into `[passing, failing]` collections
- `ModelCollection.append(attrs)` / `setAppends(attrs)` / `withoutAppends()` — delegate to each model
- `ModelCollection.mergeVisible(cols)` / `mergeHidden(cols)` — add to existing visibility lists on each model
- `ModelCollection.loadCount(relations)` — runs `withCount` query and populates `_relations` on each model
- `ModelCollection.loadSum/Min/Max/Avg(relation, column)` — same for aggregate functions
- `ModelCollection.toResourceCollection(collectionClass?)` — respects `@UseResourceCollection` binding

#### Phase 20 — Relations: Save/Create/Touch/Pivot Extras
- `HasOne.saveMany()` / `HasOne.createMany()` — bulk write helpers (matching `HasMany`)
- `MorphOne.saveMany()` / `MorphOne.createMany()` — bulk write helpers (matching `MorphMany`)
- `BelongsToMany.syncWithPivotValues(ids, pivotValues, detaching?)` — sync with fixed pivot attributes
- `MorphToMany.syncWithPivotValues(...)` — same for morphed many-to-many
- `MorphedByMany.syncWithPivotValues(...)` — same for inverse morphed many-to-many
- `Model._touches` property — list of relation names whose parent `updated_at` is touched after every `save()`
- `Model.touch(relation?)` — update `updated_at` on this model or a named relation parent
- `ModelBuilder.whereAttachedTo(relation, model)` / `orWhereAttachedTo(...)` — filter via pivot table EXISTS
- `ModelBuilder.whereMorphedTo(relation, model)` / `whereNotMorphedTo(...)` — filter by morph type+id
- `ModelBuilder.whereMorphRelation(relation, types, col, op?, val)` / `orWhereMorphRelation(...)` — morph EXISTS with column filter

#### Phase 19 — Model Convenience Methods
- `Model.saveOrFail()` — save inside a transaction; throws if cancelled by event listener
- `Model.deleteOrFail()` — delete inside a transaction; throws if cancelled
- `Model.updateOrFail(attrs)` — fill + saveOrFail
- `Model.destroyAndFire(...ids)` — bulk delete loading each model so events fire
- `Model.forceDestroy(...ids)` — bulk force-delete (uses `forceDelete()` if available)
- `Model.increment(col, amount?)` / `decrement(col, amount?)` — atomic column update + in-memory sync
- `Model.getPrevious(col?)` — snapshot of attributes before the last `save()`
- `Model.withoutTimestamps(callback)` — static; disables timestamp writes inside the closure
- `Model.preventSilentlyDiscardingAttributes(enable?)` — strict mass-assignment mode; throws on non-fillable key
- `Model._defaults` property — default attribute values applied in `newInstance()`
- `Model.firstOr(callback)` — static shorthand for `query().firstOr(callback)`
- `ModelBuilder.firstOr(callback)` — return first result or execute callback
- `ModelBuilder.chunkById(size, callback, col?)` — stable chunk iteration ordered by PK
- `ModelBuilder.lazy(size?)` — async generator in offset pages
- `ModelBuilder.lazyById(size?, col?)` — async generator via cursor pagination

#### Phase 18 — SQL Server Driver
- `SQLServerAdapter` — `mssql`-backed adapter with `SAVE TRANSACTION` savepoints
- `SQLServerQueryGrammar` — `@p1`/`@p2` named params, `[bracket]` identifiers, `TOP`/`OFFSET-FETCH` pagination, `OUTPUT INSERTED.*` for INSERT returning, `MERGE` for upsert
- `SQLServerSchemaGrammar` — `IDENTITY(1,1)`, `BIT`, `NVARCHAR`, `UNIQUEIDENTIFIER`, `DATETIME2`

#### Phase 17 — MariaDB Driver
- `MariaDBAdapter` — `mariadb` package adapter with savepoint support
- `MariaDBQueryGrammar` — `RETURNING` clause for INSERT/UPDATE/DELETE
- `MariaDBSchemaGrammar` — native `UUID` type, `JSON` column alias

#### Phase 16 — API Resources
- `Resource<T>` abstract base class — `toArray()`, `when()`, `mergeWhen()`, `whenLoaded()`, `resolve()`, `toResponse()`, `Resource.make()`, `Resource.collection()`
- `ResourceCollection<T, R>` — `additional()`, `wrap()`, `resolveData()`, `toResponse()`
- `ConditionalValue` and `MergeValue` helpers for conditional serialization

#### Phase 15 — SQLite Driver
- `SQLiteAdapter` — `better-sqlite3` adapter with WAL mode, foreign key pragma, savepoints
- `SQLiteQueryGrammar` — `?`-positional params, double-quoted identifiers
- `SQLiteSchemaGrammar` — `INTEGER PRIMARY KEY AUTOINCREMENT`, inline foreign keys, `TEXT` for date/json/uuid

#### Phase 14 — MySQL Driver
- `MySQLAdapter` — `mysql2` optional dependency adapter with savepoints
- `MySQLQueryGrammar` — `?`-positional params, backtick identifiers
- `MySQLSchemaGrammar` — `AUTO_INCREMENT`, `ENGINE=InnoDB`, `TINYINT(1)` for booleans

#### Phase 13 — Factories
- `Factory<T>` abstract base class with `definition()`, `make()`, `create()`, `count()`, `state()`, `sequence()`, `afterMaking()`, `afterCreating()`, `has()`, `for()`
- `Sequence` helper for cycling through attribute sets
- `Model._factory` static property — register a factory class on a model
- `Model.factory()` — static shorthand to instantiate the bound factory

#### Phase 12 — Pagination
- `Paginator<T>` type — `{ data, total, perPage, currentPage, lastPage, from, to, hasMorePages }`
- `SimplePaginator<T>` type — `{ data, perPage, currentPage, hasMorePages }`
- `ModelBuilder.paginate(perPage, page?)` — two queries: COUNT + data
- `ModelBuilder.simplePaginate(perPage, page?)` — one query: fetch perPage+1, check for next page

#### Phase 11 — ModelCollection
- `ModelCollection<T>` subclass of `Collection<T>` with model-class reference
- `findByKey(id)`, `findOrFail(id)`, `modelKeys()`, `except(ids)`, `only(ids)`, `diff(other)`, `intersect(other)`
- `toQuery()` — returns a `ModelBuilder` pre-scoped to collection PKs
- `fresh(relations?)`, `load(relations)`, `loadMissing(relations)`
- `makeVisible()`, `makeHidden()`, `setVisible()`, `setHidden()`
- `ModelBuilder.get()` now returns `ModelCollection<T>`

#### Phase 10 — Accessors & Mutators
- `@accessor` decorator — registers getter function in `ModelMetadata`; getter runs transparently on proxied instance
- `@mutator` decorator — registers setter that intercepts Proxy `set` trap
- Class-based cast support: `CastClass` interface with `get()` and `set()`; `CastClassConstructor` type
- `_castSet` applied in Proxy `set` trap for class-based casts
- `ModelBuilder.withCasts(map)` — per-query cast overrides stored as `_instanceCasts` on hydrated models

#### Phase 9 — Serialization
- `@visible(columns)` decorator — allowlist for serialization (inverse of `@hidden`)
- `@appends(attrs)` decorator — computed accessor names always included in `toArray()`
- `Model.makeVisible()` / `makeHidden()` — temporary per-instance visibility overrides, chainable
- `Model.setVisible()` / `setHidden()` — replace instance visible/hidden list
- `Model.mergeVisible()` / `mergeHidden()` — add to existing per-instance list
- `Model.append()` / `mergeAppends()` / `setAppends()` / `withoutAppends()` — runtime appends control
- `Model.toArray()` — serializes attributes + loaded relations recursively; `toJSON()` delegates here
- `Model.attributesToArray()` — attributes only, no relations; applies visibility, hidden, appends
- `toJSON()` updated to call `toArray()` so `JSON.stringify(model)` includes loaded relations

#### Phase 8 — Tier 2 Completion
- `Model.loadSum/loadMin/loadMax/loadAvg(relation, column)` — instance-level aggregate loading
- `ModelBuilder.orHas()` / `orWhereHas()` / `orDoesntHave()` / `orWhereDoesntHave()` — OR variants of existence checks
- `ModelBuilder.whereHasMorph(relation, types, callback?)` — existence check on polymorphic relation; supports `'*'` for all MorphMap types
- `ModelBuilder.whereDoesntHaveMorph(...)` — NOT EXISTS variant
- `BelongsToMany.withPivotValue(column, value)` — default pivot value merged into every `attach()`
- `MorphToMany.withPivotValue(...)` — same
- `Model.preventLazyLoading(enable?)` — global flag that throws `LazyLoadingViolationError` on any `getResults()` call
- `LazyLoadingViolationError` custom error class

#### Phase 7 — Relationships Tier 2
- `HasOneThrough<T>` — `hasOneThrough(Related, Through, firstKey, secondKey, localKey, secondLocalKey)`
- `HasManyThrough<T>` — `hasManyThrough(Related, Through, ...)`
- `MorphOne<T>` — `morphOne(Related, morphName)` with `save()`, `saveMany()`, `create()`, `createMany()`
- `MorphMany<T>` — `morphMany(Related, morphName)` with full write API
- `MorphTo<T>` — `morphTo(morphName)` with `associate()`, `dissociate()`; eager load groups by type
- `MorphToMany<T>` — `morphToMany(Related, morphName, pivotTable, ...)`; full pivot API
- `MorphedByMany<T>` — `morphedByMany(Related, morphName, ...)`; inverse morphed many-to-many
- `MorphMap` global static registry — `MorphMap.register(alias, ModelClass)`, `MorphMap.getAlias()`, `MorphMap.resolve()`, `MorphMap.allAliases()`
- `ModelBuilder.withSum/withMin/withMax/withAvg/withExists(relation, column?)` — aggregate subqueries in SELECT
- `ModelBuilder.whereRelation(relation, col, op?, val)` — shorthand for constrained `whereHas`
- `ModelBuilder.orWhereRelation(...)` — OR variant
- `Model.load(relations)` / `loadMissing(relations)` / `loadCount(relation)` — instance-level eager loading
- `ModelBuilder.loadModels(models, relations)` — eager load onto an array of already-fetched instances
- `HasOne.latestOfMany()` / `oldestOfMany()` / `ofMany(col, fn)` — return the single record with the highest/lowest value
- `BelongsTo.withDefault(attrs?)` — return a default empty model if the related record is null
- `BelongsToMany.wherePivot(col, val)` / `orWherePivot(...)` — filter on pivot columns
- `BelongsToMany.orderByPivot(col, dir?)` — order by pivot column
- `BelongsToMany.as(alias)` — rename the pivot accessor on loaded models

---

## [0.1.0] - 2026-06-06

### Added

#### Phase 6 — Relationships Tier 1
- `Relation<TRelated>` abstract base — extends `ModelBuilder<TRelated>`
- `HasOne<T>`, `HasMany<T>`, `BelongsTo<T>`, `BelongsToMany<T>` + `PivotRecord`
- FK inference: `hasOne(Post)` → `post_id`; pivot → sorted names `role_user`
- Eager loading via `ModelBuilder.with(relations)` — `WHERE fk IN (...)` strategy
- Nested eager loading: `with('comments.author')`; constrained: `with({ posts: q => ... })`
- `ModelBuilder.has()`, `whereHas()`, `doesntHave()`, `whereDoesntHave()`
- `ModelBuilder.withCount(relations)` — `relation_count` in SELECT
- `BelongsToMany`: `attach()`, `detach()`, `sync()`, `toggle()`, `updateExistingPivot()`, `withPivot()`, `withTimestamps()`
- `BelongsTo.associate()` / `dissociate()`

#### Phase 5 — Model Events & Observers
- 14-event lifecycle system (retrieved, creating, created, updating, updated, saving, saved, deleting, deleted, forceDeleting, forceDeleted, restoring, restored, replicating)
- `EventDispatcher` per class stored in `ModelMetadata`
- `Observer<T>` interface; `Model.observe()`, `@observedBy()`
- Shorthand hooks: `Model.creating()`, `created()`, `saving()`, `saved()`, etc.
- `Model.withoutEvents(callback)` — suppress all events
- `saveQuietly()`, `deleteQuietly()`, `restoreQuietly()` on `SoftDeletes`

#### Phase 4 — Soft Deletes & Scopes
- `SoftDeletes` TypeScript mixin — `delete()` sets `deleted_at`; `forceDelete()`, `restore()`, `trashed()`
- `SoftDeleteScope` — `WHERE deleted_at IS NULL` applied globally
- `ModelBuilder.withTrashed()`, `onlyTrashed()`, `restore()`
- `Scope` interface, `@scopedBy([...])` decorator
- `ModelBuilder.withoutGlobalScope()`, `withoutGlobalScopes()`
- `@scope` decorator — local scope methods; `Model.query()` Proxy for fluent scope chaining

#### Phase 3 — Model Base Class
- `Model` Active Record base class with dirty tracking via `Proxy`
- Decorators: `@table`, `@fillable`, `@guarded`, `@withoutTimestamps`, `@casts`, `@hidden`
- `ModelMetadata` per-class config registry
- Static API: `all`, `find`, `findOrFail`, `firstWhere`, `firstOrCreate`, `firstOrNew`, `updateOrCreate`, `create`, `destroy`, `truncate`
- Instance API: `save`, `update`, `delete`, `fill`, `fresh`, `refresh`, `replicate`, `is`, `isNot`
- Dirty tracking: `isDirty`, `isClean`, `wasChanged`, `getOriginal`, `getChanges`
- `Collection<T>` — typed array wrapper with 25+ helpers

#### Phase 2 — Query Builder
- `QueryBuilder` with full fluent API (50+ methods)
- SELECT, WHERE (all variants), JOIN, ORDER, GROUP/HAVING, LIMIT/OFFSET, LOCKING
- Aggregates: `count`, `sum`, `min`, `max`, `avg`
- Write: `insert`, `insertGetId`, `upsert`, `update`, `increment`, `decrement`, `delete`, `truncate`
- `PostgresQueryGrammar` — `$1`/`$2` positional parameters
- `Expression` / `raw()` for verbatim SQL fragments

#### Phase 1 — Foundation
- `PostgresAdapter` — `pg` pool + savepoint-based nested transactions
- `ConnectionManager` — named connection registry
- `Blueprint` — 30+ column types with modifiers
- `PostgresSchemaGrammar` — compiles Blueprint to DDL
- `Schema` facade: `create`, `table`, `drop`, `dropIfExists`, `hasTable`, `hasColumn`, `getColumnListing`
- `Migration` abstract base, `MigrationRepository`, `Migrator`
- CLI: `migrate`, `migrate:rollback`, `migrate:reset`, `migrate:status`, `make:migration`

[Unreleased]: https://github.com/wrsouza/orion/compare/v0.3.3...HEAD
[0.3.3]: https://github.com/wrsouza/orion/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/wrsouza/orion/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/wrsouza/orion/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/wrsouza/orion/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/wrsouza/orion/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/wrsouza/orion/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/wrsouza/orion/releases/tag/v0.1.0
