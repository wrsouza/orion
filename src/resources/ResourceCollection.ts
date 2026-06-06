import { Resource, ResourceResponse } from './Resource';

/**
 * Wraps an array of models as a collection of resources.
 *
 * Created automatically by `Resource.collection()` or `ModelCollection.toResourceCollection()`.
 *
 * ```ts
 * const col = UserResource.collection(users);
 * col.toResponse();
 * // { data: [{ id: 1, ... }, { id: 2, ... }] }
 *
 * col.additional({ meta: { total: 100 } }).toResponse();
 * // { data: [...], meta: { total: 100 } }
 * ```
 */
export class ResourceCollection<T, R extends Resource<T> = Resource<T>> {
  private _additional: Record<string, unknown> = {};
  private _headers: Record<string, string> = {};
  private _wrap = 'data';

  constructor(
    protected readonly items: T[],
    protected readonly resourceClass?: new (resource: T) => R
  ) {}

  /** Add extra top-level keys to the response (meta, links, etc.). */
  additional(data: Record<string, unknown>): this {
    Object.assign(this._additional, data);
    return this;
  }

  /** Add HTTP response headers returned by `response()`. */
  withResponseHeaders(headers: Record<string, string>): this {
    Object.assign(this._headers, headers);
    return this;
  }

  /** Change the wrapping key (default: `'data'`). */
  wrap(key: string): this {
    this._wrap = key;
    return this;
  }

  /**
   * Override to provide top-level meta always merged into the response.
   *
   * @example
   * ```ts
   * class UserCollection extends ResourceCollection<User, UserResource> {
   *   with(): Record<string, unknown> {
   *     return { meta: { version: '1.0' } };
   *   }
   * }
   * ```
   */
  with(): Record<string, unknown> {
    return {};
  }

  /**
   * Override to customise the pagination meta block when this collection is
   * produced by `paginate()` / `simplePaginate()`.
   *
   * The `paginated` object has the shape returned by `Paginator` / `SimplePaginator`.
   * Return `null` to suppress the pagination block entirely.
   *
   * @example
   * ```ts
   * paginationInformation(_req: unknown, paginated: any): Record<string, unknown> {
   *   return { current_page: paginated.currentPage, total: paginated.total };
   * }
   * ```
   */
  paginationInformation(
    _request: unknown,
    paginated: Record<string, unknown>
  ): Record<string, unknown> | null {
    return {
      current_page: paginated.currentPage,
      per_page: paginated.perPage,
      total: paginated.total ?? undefined,
      last_page: paginated.lastPage ?? undefined,
      from: paginated.from ?? undefined,
      to: paginated.to ?? undefined,
      has_more: paginated.hasMorePages,
    };
  }

  /**
   * Lifecycle hook called before the response is returned.
   * Override to mutate headers or data.
   */
  withResponse(_request: unknown, _response: ResourceResponse): void {}

  /** Resolve just the data array without the envelope. */
  resolveData(): Record<string, unknown>[] {
    if (this.resourceClass) {
      return this.items.map((item) => new this.resourceClass!(item).resolve());
    }
    // No resource class bound — return raw items serialized as plain objects
    return this.items.map((item) => {
      if (
        item !== null &&
        typeof item === 'object' &&
        typeof (item as any).toArray === 'function'
      ) {
        return (item as any).toArray();
      }
      return item as Record<string, unknown>;
    });
  }

  /** Return the full response envelope with data + any additional top-level keys. */
  toResponse(request?: unknown): Record<string, unknown> {
    const envelope: Record<string, unknown> = {
      [this._wrap]: this.resolveData(),
      ...this.with(),
      ...this._additional,
    };
    const resp = new ResourceResponse(envelope, { ...this._headers });
    this.withResponse(request, resp);
    return resp.data;
  }

  /**
   * Return a `ResourceResponse` carrying both the envelope and HTTP headers.
   *
   * @example
   * ```ts
   * const { data, headers } = UserResource.collection(users).response();
   * ```
   */
  response(request?: unknown): ResourceResponse {
    const envelope = this.toResponse(request);
    const resp = new ResourceResponse(envelope, { ...this._headers });
    this.withResponse(request, resp);
    return resp;
  }

  /** Called automatically by `JSON.stringify()`. */
  toJSON(): Record<string, unknown> {
    return this.toResponse();
  }
}
