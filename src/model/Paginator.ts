import { ModelCollection } from './ModelCollection';

/**
 * Result of a full `paginate()` call.
 * Contains the data page plus all metadata needed to render pagination UI.
 *
 * @example
 * ```ts
 * const page = await User.where('active', true).paginate(15);
 *
 * page.data          // ModelCollection<User> — the current page
 * page.total         // 100 — total matching rows
 * page.perPage       // 15
 * page.currentPage   // 1
 * page.lastPage      // 7
 * page.from          // 1  (1-based index of first row on this page)
 * page.to            // 15 (1-based index of last row on this page)
 * page.hasMorePages  // true
 * ```
 */
export class Paginator<T> {
  /** The models on the current page. */
  readonly data: ModelCollection<T>;
  /** Total number of matching rows across all pages. */
  readonly total: number;
  /** Number of rows per page. */
  readonly perPage: number;
  /** The current page number (1-based). */
  readonly currentPage: number;
  /** The last page number (`Math.ceil(total / perPage)`). */
  readonly lastPage: number;
  /** 1-based index of the first row on this page, or `0` when empty. */
  readonly from: number;
  /** 1-based index of the last row on this page, or `0` when empty. */
  readonly to: number;
  /** Whether there is at least one more page after this one. */
  readonly hasMorePages: boolean;

  constructor(data: ModelCollection<T>, total: number, perPage: number, currentPage: number) {
    this.data = data;
    this.total = total;
    this.perPage = perPage;
    this.currentPage = currentPage;
    this.lastPage = Math.max(1, Math.ceil(total / perPage));
    this.hasMorePages = currentPage < this.lastPage;

    if (data.length === 0) {
      this.from = 0;
      this.to = 0;
    } else {
      this.from = (currentPage - 1) * perPage + 1;
      this.to = this.from + data.length - 1;
    }
  }

  /** Serialise to a plain object (useful for JSON API responses). */
  toJSON(): Record<string, unknown> {
    return {
      data: [...this.data].map((m: any) => (typeof m.toArray === 'function' ? m.toArray() : m)),
      total: this.total,
      perPage: this.perPage,
      currentPage: this.currentPage,
      lastPage: this.lastPage,
      from: this.from,
      to: this.to,
      hasMorePages: this.hasMorePages,
    };
  }
}

/**
 * Result of a `simplePaginate()` call.
 * No total count — just enough information to render next/prev navigation.
 * Uses one query instead of two, making it faster for large tables.
 *
 * @example
 * ```ts
 * const page = await User.simplePaginate(15);
 *
 * page.data         // ModelCollection<User>
 * page.perPage      // 15
 * page.currentPage  // 1
 * page.hasMorePages // true  (there is a next page)
 * ```
 */
export class SimplePaginator<T> {
  /** The models on the current page. */
  readonly data: ModelCollection<T>;
  /** Number of rows per page. */
  readonly perPage: number;
  /** The current page number (1-based). */
  readonly currentPage: number;
  /** Whether there is at least one more page after this one. */
  readonly hasMorePages: boolean;

  constructor(
    data: ModelCollection<T>,
    perPage: number,
    currentPage: number,
    hasMorePages: boolean
  ) {
    this.data = data;
    this.perPage = perPage;
    this.currentPage = currentPage;
    this.hasMorePages = hasMorePages;
  }

  /** Serialise to a plain object. */
  toJSON(): Record<string, unknown> {
    return {
      data: [...this.data].map((m: any) => (typeof m.toArray === 'function' ? m.toArray() : m)),
      perPage: this.perPage,
      currentPage: this.currentPage,
      hasMorePages: this.hasMorePages,
    };
  }
}
