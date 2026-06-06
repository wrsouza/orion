import { Collection } from '../model/Collection';
import { ResourceCollection } from './ResourceCollection';

// ── Conditional helpers ───────────────────────────────────────────────────────

/**
 * Represents a key/value pair that is only included when `condition` is true.
 * Use via `this.when(condition, value)` inside `toArray()`.
 */
export class ConditionalValue {
  constructor(
    public readonly condition: boolean,
    public readonly value: unknown
  ) {}
}

/**
 * Represents a set of key/value pairs that are conditionally merged into the
 * resource output. Use via `this.mergeWhen(condition, attrs)` inside `toArray()`.
 */
export class MergeValue {
  constructor(
    public readonly condition: boolean,
    public readonly data: Record<string, unknown>
  ) {}
}

// ── Response wrapper ──────────────────────────────────────────────────────────

/** Returned by `resource.response()` — carries HTTP headers alongside data. */
export class ResourceResponse {
  constructor(
    public readonly data: Record<string, unknown>,
    public readonly headers: Record<string, string> = {}
  ) {}

  toJSON(): Record<string, unknown> {
    return this.data;
  }
}

// ── Resource base class ───────────────────────────────────────────────────────

/**
 * Base class for API resource transformers.
 *
 * Extend and implement `toArray()` to define the shape of a single resource.
 *
 * ```ts
 * class UserResource extends Resource<User> {
 *   toArray(): Record<string, unknown> {
 *     return {
 *       id:    this.resource.id,
 *       name:  this.resource.name,
 *       email: this.when(this.resource.isAdmin, this.resource.email),
 *       posts: this.whenLoaded('posts', () => PostResource.collection(this.resource.getRelation('posts'))),
 *     };
 *   }
 * }
 * ```
 */
export abstract class Resource<T> {
  /** Global flag — when `true`, `toResponse()` returns raw `resolve()` without the `data` key. */
  private static _withoutWrapping = false;

  constructor(public readonly resource: T) {}

  // ── Abstract ──────────────────────────────────────────────────────────────

  /** Define the key/value pairs for this resource. */
  abstract toArray(): Record<string, unknown>;

  // ── Top-level meta ────────────────────────────────────────────────────────

  private _additional: Record<string, unknown> = {};
  private _headers: Record<string, string> = {};

  /**
   * Add extra top-level keys merged into `toResponse()` output.
   *
   * @example
   * ```ts
   * new UserResource(user).additional({ meta: { version: 2 } }).toResponse();
   * // { data: {...}, meta: { version: 2 } }
   * ```
   */
  additional(data: Record<string, unknown>): this {
    Object.assign(this._additional, data);
    return this;
  }

  /**
   * Add HTTP response headers (returned in `response()`).
   * Override in a subclass to set static headers.
   */
  withResponseHeaders(headers: Record<string, string>): this {
    Object.assign(this._headers, headers);
    return this;
  }

  /**
   * Override to provide top-level meta that is always merged into the response.
   * Called by `toResponse()` automatically.
   *
   * @example
   * ```ts
   * class UserResource extends Resource<User> {
   *   with(): Record<string, unknown> {
   *     return { meta: { api_version: '1.0' } };
   *   }
   * }
   * ```
   */
  with(): Record<string, unknown> {
    return {};
  }

  /**
   * Lifecycle hook called just before the response is returned.
   * Override to add headers or mutate the response object.
   *
   * @example
   * ```ts
   * withResponse(_req: unknown, response: ResourceResponse): void {
   *   response.headers['X-User-Id'] = String(this.resource.id);
   * }
   * ```
   */
  withResponse(_request: unknown, _response: ResourceResponse): void {}

  // ── Helpers usable inside toArray() ──────────────────────────────────────

  /**
   * Include a key only when `condition` is truthy.
   *
   * ```ts
   * email: this.when(user.isAdmin, user.email),
   * secret: this.when(user.isAdmin, () => expensiveComputation()),
   * ```
   */
  protected when(condition: boolean, value: unknown | (() => unknown)): ConditionalValue {
    return new ConditionalValue(condition, value);
  }

  /**
   * Include a key only when `value` is not `null` and not `undefined`.
   *
   * ```ts
   * nickname: this.whenNotNull(user.nickname),
   * ```
   */
  protected whenNotNull(value: unknown): ConditionalValue {
    return new ConditionalValue(value !== null && value !== undefined, value);
  }

  /**
   * Include a key only when the named attribute exists on the resource.
   *
   * ```ts
   * bio: this.whenHas('bio'),
   * ```
   */
  protected whenHas(attribute: string): ConditionalValue {
    const model = this.resource as any;
    const exists =
      model !== null &&
      typeof model === 'object' &&
      (attribute in (model._attributes ?? {}) || attribute in model);
    return new ConditionalValue(
      exists,
      exists ? (model._attributes?.[attribute] ?? model[attribute]) : undefined
    );
  }

  /**
   * Include `{relation}_count` only if it was loaded via `withCount()`.
   *
   * ```ts
   * posts_count: this.whenCounted('posts'),
   * ```
   */
  protected whenCounted(relation: string): ConditionalValue {
    const model = this.resource as any;
    const key = `${relation}_count`;
    const loaded = model?._relations != null && key in model._relations;
    return new ConditionalValue(loaded, loaded ? model._relations[key] : undefined);
  }

  /**
   * Include an aggregate (`_sum_`, `_min_`, `_max_`, `_avg_`) only if loaded.
   *
   * ```ts
   * total_amount: this.whenAggregated('orders', 'amount', 'sum'),
   * ```
   */
  protected whenAggregated(
    relation: string,
    column: string,
    fn: 'sum' | 'min' | 'max' | 'avg'
  ): ConditionalValue {
    const model = this.resource as any;
    const key = `${relation}_${fn}_${column}`;
    const loaded = model?._relations != null && key in model._relations;
    return new ConditionalValue(loaded, loaded ? model._relations[key] : undefined);
  }

  /**
   * Include attributes only when the named pivot table record is loaded.
   *
   * ```ts
   * ...this.whenPivotLoaded('role_user', () => ({
   *   approved: this.resource.getRelation<PivotRecord>('pivot').approved,
   * })),
   * ```
   */
  protected whenPivotLoaded(
    pivotTable: string,
    value: () => Record<string, unknown>
  ): Record<string, MergeValue> {
    return this.whenPivotLoadedAs('pivot', pivotTable, value);
  }

  /**
   * Like `whenPivotLoaded`, but checks for a custom pivot alias set via `.as(alias)`.
   *
   * ```ts
   * ...this.whenPivotLoadedAs('membership', 'role_user', () => ({
   *   approved: this.resource.getRelation<PivotRecord>('membership').approved,
   * })),
   * ```
   */
  protected whenPivotLoadedAs(
    alias: string,
    _pivotTable: string,
    value: () => Record<string, unknown>
  ): Record<string, MergeValue> {
    const model = this.resource as any;
    const loaded = model?._relations != null && alias in model._relations;
    const key = `__merge_${this._mergeCounter++}__`;
    return { [key]: new MergeValue(loaded, loaded ? value() : {}) };
  }

  /**
   * Conditionally merge a set of attributes into the resource output.
   *
   * ```ts
   * return {
   *   id: this.resource.id,
   *   ...this.mergeWhen(user.isAdmin, { role: 'admin' }),
   * };
   * ```
   */
  protected mergeWhen(
    condition: boolean,
    data: Record<string, unknown>
  ): Record<string, MergeValue> {
    const key = `__merge_${this._mergeCounter++}__`;
    return { [key]: new MergeValue(condition, data) };
  }

  private _mergeCounter = 0;

  /**
   * Include a related resource only if the relation is eager-loaded.
   *
   * ```ts
   * posts: this.whenLoaded('posts', () => PostResource.collection(this.resource.getRelation('posts'))),
   * ```
   */
  protected whenLoaded(relation: string, value: unknown | (() => unknown)): ConditionalValue {
    const model = this.resource as any;
    const loaded =
      model !== null &&
      typeof model === 'object' &&
      typeof model._relations === 'object' &&
      model._relations !== null &&
      relation in model._relations;

    return new ConditionalValue(
      loaded,
      typeof value === 'function' ? (loaded ? (value as () => unknown)() : undefined) : value
    );
  }

  // ── Serialization ─────────────────────────────────────────────────────────

  /** Resolve the final output object, filtering conditional values. */
  resolve(): Record<string, unknown> {
    const raw = this.toArray();
    return this._filterConditionals(raw);
  }

  private _filterConditionals(obj: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(obj)) {
      if (val instanceof MergeValue) {
        if (val.condition) {
          Object.assign(out, this._filterConditionals(val.data));
        }
        continue;
      }

      if (val instanceof ConditionalValue) {
        if (val.condition) {
          const resolved =
            typeof val.value === 'function' ? (val.value as () => unknown)() : val.value;
          out[key] = this._resolveValue(resolved);
        }
        continue;
      }

      out[key] = this._resolveValue(val);
    }

    return out;
  }

  private _resolveValue(val: unknown): unknown {
    if (val instanceof Resource) return val.resolve();
    if (val instanceof ResourceCollection) return val.resolveData();
    if (Array.isArray(val)) return val.map((v) => this._resolveValue(v));
    return val;
  }

  /**
   * Wrap the resource in a response envelope.
   * Top-level meta from `with()` and `additional()` are merged in.
   * When `Resource.withoutWrapping()` was called, the data is returned unwrapped.
   *
   * @param request - Optional request context passed to `withResponse()`.
   */
  toResponse(request?: unknown): Record<string, unknown> {
    const data = this.resolve();
    const meta = { ...this.with(), ...this._additional };

    const envelope: Record<string, unknown> = Resource._withoutWrapping
      ? { ...data, ...meta }
      : { data, ...meta };

    const resp = new ResourceResponse(envelope, { ...this._headers });
    this.withResponse(request, resp);
    return resp.data;
  }

  /**
   * Return a `ResourceResponse` with both the envelope and HTTP headers.
   *
   * @example
   * ```ts
   * const { data, headers } = new UserResource(user).response();
   * ```
   */
  response(request?: unknown): ResourceResponse {
    const envelope = this.toResponse(request);
    const resp = new ResourceResponse(envelope, { ...this._headers });
    this.withResponse(request, resp);
    return resp;
  }

  // ── Static helpers ────────────────────────────────────────────────────────

  /**
   * Disable the `data` envelope globally for all resources.
   * Call once at app startup.
   *
   * @example
   * ```ts
   * Resource.withoutWrapping();
   * new UserResource(user).toResponse(); // { id: 1, name: 'Alice' } (no 'data' key)
   * ```
   */
  static withoutWrapping(disable = true): void {
    Resource._withoutWrapping = disable;
  }

  /** Wrap a single model in a resource. Equivalent to `new UserResource(model)`. */
  static make<T, R extends Resource<T>>(this: new (resource: T) => R, resource: T): R {
    return new this(resource);
  }

  /**
   * Wrap an array, `Collection`, or iterable of models in a `ResourceCollection`.
   *
   * ```ts
   * UserResource.collection(users)  // ResourceCollection<UserResource>
   * ```
   */
  static collection<T, R extends Resource<T>>(
    this: new (resource: T) => R,
    resources: T[] | Collection<T>
  ): ResourceCollection<T, R> {
    const ctor = this as unknown as new (resource: T) => R;
    const arr =
      resources instanceof Collection ? (resources as Collection<T>).toArray() : resources;
    return new ResourceCollection(arr, ctor);
  }
}
