/**
 * JSON:API 1.1 compliant resource transformer.
 *
 * Extend this class instead of `Resource` when your API needs to comply with
 * the JSON:API specification (https://jsonapi.org/).
 *
 * The response shape produced by `toResponse()` follows:
 * ```json
 * {
 *   "data": {
 *     "type": "users",
 *     "id": "1",
 *     "attributes": { "name": "Alice", "email": "a@example.com" },
 *     "relationships": {
 *       "posts": { "data": [{ "type": "posts", "id": "2" }] }
 *     },
 *     "links": { "self": "/users/1" }
 *   },
 *   "included": [ ... ]
 * }
 * ```
 *
 * ### Minimal usage
 * ```ts
 * class UserResource extends JsonApiResource<User> {
 *   $type = 'users';
 *   $attributes = ['name', 'email'];
 *   $relationships = ['posts'];
 * }
 *
 * new UserResource(user).toResponse();
 * ```
 *
 * ### Full control via overrides
 * ```ts
 * class UserResource extends JsonApiResource<User> {
 *   $type = 'users';
 *
 *   toAttributes() { return { name: this.resource.name }; }
 *   toRelationships() {
 *     return { posts: PostResource.jsonApiCollection(this.resource.getRelation('posts')) };
 *   }
 *   toLinks() { return { self: `/users/${this.resource.id}` }; }
 *   toMeta()  { return { version: 1 }; }
 * }
 * ```
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface JsonApiResourceObject {
  type: string;
  id: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, JsonApiRelationshipObject>;
  links?: Record<string, string | null>;
  meta?: Record<string, unknown>;
}

export interface JsonApiRelationshipObject {
  data: JsonApiResourceIdentifier | JsonApiResourceIdentifier[] | null;
  links?: Record<string, string>;
  meta?: Record<string, unknown>;
}

export interface JsonApiResourceIdentifier {
  type: string;
  id: string;
}

export interface JsonApiDocument {
  data: JsonApiResourceObject | JsonApiResourceObject[] | null;
  included?: JsonApiResourceObject[];
  meta?: Record<string, unknown>;
  links?: Record<string, string | null>;
  errors?: Array<{ title?: string; detail?: string; status?: string }>;
}

/** Options parsed from a JSON:API request query string. */
export interface JsonApiRequestContext {
  /** `fields[type]=attr1,attr2` — sparse fieldsets per type. */
  fields?: Record<string, string[]>;
  /** `include=posts,posts.comments` — dot-separated include paths. */
  include?: string[];
}

// ── JsonApiResource ───────────────────────────────────────────────────────────

export abstract class JsonApiResource<T> {
  // ── Global config ─────────────────────────────────────────────────────────

  /** Maximum nesting depth for included relationships. Default: 3. */
  private static _maxDepth = 3;

  /**
   * Set the global maximum depth for nested `include` resolution.
   * @example `JsonApiResource.maxRelationshipDepth(2);`
   */
  static maxRelationshipDepth(n: number): void {
    JsonApiResource._maxDepth = n;
  }

  // ── Declarative API ───────────────────────────────────────────────────────

  /** JSON:API resource type string (e.g. `'users'`). Must be overridden. */
  abstract readonly $type: string;

  /**
   * Attribute names to expose from the resource.
   * Used when `toAttributes()` is not overridden.
   */
  $attributes: string[] = [];

  /**
   * Relationship names to expose.
   * Each name must correspond to a loaded `_relations` entry on the model.
   * Used when `toRelationships()` is not overridden.
   */
  $relationships: string[] = [];

  private _ignoreQueryString = false;
  private _includePreviouslyLoaded = false;
  private _requestContext: JsonApiRequestContext = {};

  constructor(public readonly resource: T) {}

  // ── Overridable methods ───────────────────────────────────────────────────

  /**
   * Return the resource's `id`. Defaults to `resource.id` cast to string.
   * Override for composite keys or non-`id` PKs.
   */
  toId(): string {
    return String((this.resource as any)?.id ?? (this.resource as any)?._attributes?.id ?? '');
  }

  /**
   * Return the resource type. Defaults to `$type`.
   * Override for polymorphic scenarios.
   */
  toType(): string {
    return this.$type;
  }

  /**
   * Return the attributes object. Defaults to picking `$attributes` from the resource.
   * Override for full control.
   */
  toAttributes(_request?: JsonApiRequestContext): Record<string, unknown> {
    const model = this.resource as any;
    const source: Record<string, unknown> =
      typeof model.attributesToArray === 'function'
        ? model.attributesToArray()
        : typeof model.toArray === 'function'
          ? model.toArray()
          : { ...model };

    const attrs: Record<string, unknown> = {};
    for (const key of this.$attributes) {
      if (key in source) attrs[key] = source[key];
    }
    return attrs;
  }

  /**
   * Return a map of relationship objects.
   * Defaults to building resource-identifier linkage for each name in `$relationships`.
   */
  toRelationships(_request?: JsonApiRequestContext): Record<string, JsonApiRelationshipObject> {
    const model = this.resource as any;
    const rels: Record<string, JsonApiRelationshipObject> = {};

    for (const relName of this.$relationships) {
      const related = model?._relations?.[relName];
      if (related === undefined) continue;

      if (related === null) {
        rels[relName] = { data: null };
      } else if (
        Array.isArray(related) ||
        (related && typeof related[Symbol.iterator] === 'function')
      ) {
        const items = [...related];
        rels[relName] = {
          data: items.map((r: any) => this._toIdentifier(r)),
        };
      } else if (typeof related === 'object' && '_attributes' in related) {
        rels[relName] = { data: this._toIdentifier(related) };
      }
    }
    return rels;
  }

  /**
   * Return top-level links for this resource.
   * @example `toLinks() { return { self: \`/users/${this.resource.id}\` }; }`
   */
  toLinks(): Record<string, string | null> {
    return {};
  }

  /**
   * Return resource-level meta.
   */
  toMeta(): Record<string, unknown> | null {
    return null;
  }

  /**
   * When called, `fields[type]` and `include` query parameters in the request
   * context are **ignored**. Useful when you want deterministic output in tests.
   */
  ignoreFieldsAndIncludesInQueryString(): this {
    this._ignoreQueryString = true;
    return this;
  }

  /**
   * When called, all relations already present in `resource._relations` are
   * added to the `included` array, even if they weren't listed in `include`.
   */
  includePreviouslyLoadedRelationships(): this {
    this._includePreviouslyLoaded = true;
    return this;
  }

  // ── Resolve ───────────────────────────────────────────────────────────────

  /**
   * Build the `data` object for this resource.
   */
  resolve(request?: JsonApiRequestContext): JsonApiResourceObject {
    const ctx = this._ignoreQueryString ? {} : (request ?? this._requestContext);
    const fields = ctx.fields?.[this.toType()];

    let attributes = this.toAttributes(ctx);
    if (fields) {
      attributes = Object.fromEntries(
        Object.entries(attributes).filter(([k]) => fields.includes(k))
      );
    }

    const relationships = this.toRelationships(ctx);
    const links = this.toLinks();
    const meta = this.toMeta();

    const obj: JsonApiResourceObject = {
      type: this.toType(),
      id: this.toId(),
    };

    if (Object.keys(attributes).length > 0) obj.attributes = attributes;
    if (Object.keys(relationships).length > 0) obj.relationships = relationships;
    if (Object.keys(links).length > 0) obj.links = links;
    if (meta && Object.keys(meta).length > 0) obj.meta = meta;

    return obj;
  }

  /**
   * Build the full JSON:API document.
   *
   * @param request - Optional request context for sparse fieldsets / includes.
   */
  toResponse(request?: JsonApiRequestContext): JsonApiDocument {
    const ctx = this._ignoreQueryString ? {} : (request ?? this._requestContext);
    const data = this.resolve(ctx);
    const included = this._collectIncluded(ctx, 0);

    const doc: JsonApiDocument = { data };
    if (included.length > 0) doc.included = included;

    return doc;
  }

  // ── Static helpers ────────────────────────────────────────────────────────

  /**
   * Wrap a single model in a `JsonApiResource`.
   */
  static make<T, R extends JsonApiResource<T>>(this: new (resource: T) => R, resource: T): R {
    return new this(resource);
  }

  /**
   * Return a `JsonApiCollectionResource` for an array or iterable of models.
   */
  static jsonApiCollection<T, R extends JsonApiResource<T>>(
    this: new (resource: T) => R,
    resources: T[] | Iterable<T>
  ): JsonApiCollectionResource<T, R> {
    const arr = Array.isArray(resources) ? resources : [...resources];
    return new JsonApiCollectionResource(arr, this as new (resource: T) => R);
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private _toIdentifier(model: any): JsonApiResourceIdentifier {
    const id = String(model?._attributes?.id ?? model?.id ?? '');
    // Try to get the type from a registered JsonApiResource binding or
    // fall back to the plural snake_case of the constructor name.
    const type = _guessType(model);
    return { type, id };
  }

  private _collectIncluded(ctx: JsonApiRequestContext, depth: number): JsonApiResourceObject[] {
    if (depth >= JsonApiResource._maxDepth) return [];

    const model = this.resource as any;
    const included: JsonApiResourceObject[] = [];
    const seen = new Set<string>();

    const relNames = new Set<string>([
      ...this.$relationships,
      ...(this._includePreviouslyLoaded ? Object.keys(model?._relations ?? {}) : []),
      ...(ctx.include ?? []).map((p) => p.split('.')[0]),
    ]);

    for (const relName of relNames) {
      const related = model?._relations?.[relName];
      if (related === undefined || related === null) continue;

      const items: any[] = Array.isArray(related)
        ? related
        : typeof related[Symbol.iterator] === 'function'
          ? [...related]
          : [related];

      for (const item of items) {
        if (!item?._attributes) continue;
        const key = `${_guessType(item)}:${item._attributes?.id}`;
        if (seen.has(key)) continue;
        seen.add(key);

        // Build included object from the item directly (no resource class needed)
        const itemObj = _buildIncludedObject(item, ctx, depth);
        included.push(itemObj);

        // Recurse into nested includes (e.g. `posts.comments`)
        const nestedIncludes = (ctx.include ?? [])
          .filter((p) => p.startsWith(`${relName}.`))
          .map((p) => p.slice(relName.length + 1));

        if (nestedIncludes.length > 0) {
          const childCtx = { ...ctx, include: nestedIncludes };
          // Create a temporary resource to recurse
          const tempResource = new _PassthroughResource(item, _guessType(item));
          tempResource.$relationships = Object.keys(item._relations ?? {});
          const nested = tempResource._collectIncluded(childCtx, depth + 1);
          for (const n of nested) {
            const nKey = `${n.type}:${n.id}`;
            if (!seen.has(nKey)) {
              seen.add(nKey);
              included.push(n);
            }
          }
        }
      }
    }

    return included;
  }
}

// ── JsonApiCollectionResource ─────────────────────────────────────────────────

/**
 * Wraps an array of models as a JSON:API collection document.
 *
 * ```ts
 * UserResource.jsonApiCollection(users).toResponse();
 * // { data: [{ type: 'users', id: '1', ... }, ...] }
 * ```
 */
export class JsonApiCollectionResource<T, R extends JsonApiResource<T>> {
  private _meta: Record<string, unknown> = {};
  private _links: Record<string, string | null> = {};

  constructor(
    private readonly items: T[],
    private readonly resourceClass: new (resource: T) => R
  ) {}

  /** Add top-level meta to the document. */
  meta(data: Record<string, unknown>): this {
    Object.assign(this._meta, data);
    return this;
  }

  /** Add top-level links to the document. */
  links(data: Record<string, string | null>): this {
    Object.assign(this._links, data);
    return this;
  }

  /** Build the full JSON:API collection document. */
  toResponse(request?: JsonApiRequestContext): JsonApiDocument {
    const included: JsonApiResourceObject[] = [];
    const seen = new Set<string>();

    const data = this.items.map((item) => {
      const resource = new this.resourceClass(item);
      const obj = resource.resolve(request);

      // Collect included from each item
      for (const inc of (resource as any)._collectIncluded(request ?? {}, 0)) {
        const key = `${inc.type}:${inc.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          included.push(inc);
        }
      }

      return obj;
    });

    const doc: JsonApiDocument = { data };
    if (included.length > 0) doc.included = included;
    if (Object.keys(this._meta).length > 0) doc.meta = this._meta;
    if (Object.keys(this._links).length > 0) doc.links = this._links;

    return doc;
  }

  /** Called automatically by `JSON.stringify()`. */
  toJSON(): JsonApiDocument {
    return this.toResponse();
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Guess a JSON:API type string from a model instance (plural snake_case). */
function _guessType(model: any): string {
  const name: string = model?.constructor?.name ?? 'unknown';
  return _toSnakePlural(name);
}

function _toSnakePlural(name: string): string {
  const snake = name
    .replace(/([A-Z])/g, (m, p1, offset) => (offset > 0 ? '_' : '') + p1.toLowerCase())
    .toLowerCase();
  if (
    snake.endsWith('s') ||
    snake.endsWith('x') ||
    snake.endsWith('z') ||
    snake.endsWith('ch') ||
    snake.endsWith('sh')
  )
    return snake + 'es';
  if (snake.endsWith('y') && !/[aeiou]y$/.test(snake)) return snake.slice(0, -1) + 'ies';
  return snake + 's';
}

/** Build a JSON:API resource object from a plain model (no resource class). */
function _buildIncludedObject(
  model: any,
  ctx: JsonApiRequestContext,
  _depth: number
): JsonApiResourceObject {
  const type = _guessType(model);
  const id = String(model._attributes?.id ?? '');
  const fields = ctx.fields?.[type];

  const rawAttrs: Record<string, unknown> = { ...(model._attributes ?? {}) };
  delete rawAttrs['id'];

  const attributes: Record<string, unknown> = fields
    ? Object.fromEntries(Object.entries(rawAttrs).filter(([k]) => fields.includes(k)))
    : rawAttrs;

  const obj: JsonApiResourceObject = { type, id };
  if (Object.keys(attributes).length > 0) obj.attributes = attributes;
  return obj;
}

/** Minimal passthrough resource used for nested include recursion. */
class _PassthroughResource<T> extends JsonApiResource<T> {
  $type: string;
  constructor(resource: T, type: string) {
    super(resource);
    this.$type = type;
  }
}
