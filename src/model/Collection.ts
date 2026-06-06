/**
 * A typed, immutable-safe wrapper around an array of model instances.
 * Provides Eloquent-style collection helpers on top of the standard JS `Array`.
 *
 * @example
 * ```ts
 * const users = await User.all();             // Collection<User>
 * const actives = users.filter(u => u.active);
 * const names   = users.pluck('name');        // string[]
 * const byRole  = users.groupBy('role');      // Map<unknown, Collection<User>>
 * ```
 */
export class Collection<T> implements Iterable<T> {
  private readonly items: T[];

  constructor(items: T[] = []) {
    this.items = [...items];
  }

  // ── Iteration ─────────────────────────────────────────────────────────────

  [Symbol.iterator](): Iterator<T> {
    return this.items[Symbol.iterator]();
  }

  /** Total number of items. */
  get length(): number {
    return this.items.length;
  }

  /** Return `true` if the collection has no items. */
  isEmpty(): boolean {
    return this.items.length === 0;
  }

  /** Return `true` if the collection has at least one item. */
  isNotEmpty(): boolean {
    return this.items.length > 0;
  }

  // ── Access ────────────────────────────────────────────────────────────────

  /** Return the item at `index`, or `undefined`. */
  get(index: number): T | undefined {
    return this.items[index];
  }

  /** Return the first item, or `undefined` if empty. */
  first(): T | undefined;
  /** Return the first item matching `predicate`, or `undefined`. */
  first(predicate: (item: T) => boolean): T | undefined;
  first(predicate?: (item: T) => boolean): T | undefined {
    if (!predicate) return this.items[0];
    return this.items.find(predicate);
  }

  /** Return the last item, or `undefined` if empty. */
  last(): T | undefined;
  last(predicate: (item: T) => boolean): T | undefined;
  last(predicate?: (item: T) => boolean): T | undefined {
    if (!predicate) return this.items[this.items.length - 1];
    return [...this.items].reverse().find(predicate);
  }

  /** Plain JS array copy. */
  toArray(): T[] {
    return [...this.items];
  }

  // ── Filtering ─────────────────────────────────────────────────────────────

  /** Return a new Collection with items matching `predicate`. */
  filter(predicate: (item: T, index: number) => boolean): Collection<T> {
    return new Collection(this.items.filter(predicate));
  }

  /** Return a new Collection with items NOT matching `predicate`. */
  reject(predicate: (item: T, index: number) => boolean): Collection<T> {
    return this.filter((item, i) => !predicate(item, i));
  }

  /** Return `true` if any item matches `predicate`. */
  some(predicate: (item: T) => boolean): boolean {
    return this.items.some(predicate);
  }

  /** Return `true` if every item matches `predicate`. */
  every(predicate: (item: T) => boolean): boolean {
    return this.items.every(predicate);
  }

  /** Return `true` if the collection contains `item` (strict equality). */
  contains(item: T): boolean;
  /** Return `true` if any item matches `predicate`. */
  contains(predicate: (item: T) => boolean): boolean;
  contains(itemOrPredicate: T | ((item: T) => boolean)): boolean {
    if (typeof itemOrPredicate === 'function') {
      return this.items.some(itemOrPredicate as (item: T) => boolean);
    }
    return this.items.includes(itemOrPredicate);
  }

  // ── Transformation ────────────────────────────────────────────────────────

  /** Map each item to a new value. Returns a plain array (not a Collection). */
  map<U>(fn: (item: T, index: number) => U): U[] {
    return this.items.map(fn);
  }

  /** Map and flatten one level. */
  flatMap<U>(fn: (item: T, index: number) => U[]): U[] {
    return this.items.flatMap(fn);
  }

  /** Reduce the collection to a single value. */
  reduce<U>(fn: (acc: U, item: T, index: number) => U, initial: U): U {
    return this.items.reduce(fn, initial);
  }

  /**
   * Extract a single property from every item.
   *
   * @example
   * ```ts
   * const names = users.pluck('name'); // (string | unknown)[]
   * ```
   */
  pluck<K extends keyof T>(key: K): T[K][] {
    return this.items.map((item) => item[key]);
  }

  /**
   * Group items into a `Map` keyed by the value of `key`.
   *
   * @example
   * ```ts
   * const byRole = users.groupBy('role'); // Map<string, Collection<User>>
   * ```
   */
  groupBy<K extends keyof T>(key: K): Map<T[K], Collection<T>>;
  groupBy(fn: (item: T) => unknown): Map<unknown, Collection<T>>;
  groupBy<K extends keyof T>(keyOrFn: K | ((item: T) => unknown)): Map<unknown, Collection<T>> {
    const map = new Map<unknown, T[]>();
    const getKey = typeof keyOrFn === 'function' ? keyOrFn : (item: T) => item[keyOrFn];

    for (const item of this.items) {
      const k = getKey(item);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(item);
    }

    const result = new Map<unknown, Collection<T>>();
    for (const [k, v] of map) result.set(k, new Collection(v));
    return result;
  }

  /**
   * Key items into a `Map` by a unique property — assumes each key is unique.
   *
   * @example
   * ```ts
   * const byId = users.keyBy('id'); // Map<number, User>
   * ```
   */
  keyBy<K extends keyof T>(key: K): Map<T[K], T>;
  keyBy(fn: (item: T) => unknown): Map<unknown, T>;
  keyBy<K extends keyof T>(keyOrFn: K | ((item: T) => unknown)): Map<unknown, T> {
    const getKey = typeof keyOrFn === 'function' ? keyOrFn : (item: T) => item[keyOrFn];
    const map = new Map<unknown, T>();
    for (const item of this.items) map.set(getKey(item), item);
    return map;
  }

  /** Sort items (returns a new Collection, does not mutate). */
  sortBy<K extends keyof T>(key: K, direction: 'asc' | 'desc' = 'asc'): Collection<T> {
    const sorted = [...this.items].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (av < bv) return direction === 'asc' ? -1 : 1;
      if (av > bv) return direction === 'asc' ? 1 : -1;
      return 0;
    });
    return new Collection(sorted);
  }

  /** Return a new Collection with duplicate items removed. */
  unique(): Collection<T>;
  unique<K extends keyof T>(key: K): Collection<T>;
  unique<K extends keyof T>(key?: K): Collection<T> {
    if (!key) return new Collection([...new Set(this.items)]);
    const seen = new Set();
    return new Collection(
      this.items.filter((item) => {
        const v = item[key];
        if (seen.has(v)) return false;
        seen.add(v);
        return true;
      })
    );
  }

  // ── Slicing ───────────────────────────────────────────────────────────────

  /** Return the first `n` items. */
  take(n: number): Collection<T> {
    return new Collection(this.items.slice(0, n));
  }

  /** Return the last `n` items. */
  takeLast(n: number): Collection<T> {
    return new Collection(this.items.slice(-n));
  }

  /** Skip the first `n` items. */
  skip(n: number): Collection<T> {
    return new Collection(this.items.slice(n));
  }

  /** Split into chunks of `size`. */
  chunk(size: number): Collection<T>[] {
    const chunks: Collection<T>[] = [];
    for (let i = 0; i < this.items.length; i += size) {
      chunks.push(new Collection(this.items.slice(i, i + size)));
    }
    return chunks;
  }

  // ── Numerics ──────────────────────────────────────────────────────────────

  /** Sum the values of a numeric property. */
  sum<K extends keyof T>(key: K): number {
    return this.items.reduce((acc, item) => acc + Number(item[key] ?? 0), 0);
  }

  /** Average the values of a numeric property. */
  avg<K extends keyof T>(key: K): number {
    if (!this.items.length) return 0;
    return this.sum(key) / this.items.length;
  }

  /** Minimum value of a property. */
  min<K extends keyof T>(key: K): T[K] | undefined {
    if (!this.items.length) return undefined;
    return this.items.reduce((a, b) => (a[key] < b[key] ? a : b))[key];
  }

  /** Maximum value of a property. */
  max<K extends keyof T>(key: K): T[K] | undefined {
    if (!this.items.length) return undefined;
    return this.items.reduce((a, b) => (a[key] > b[key] ? a : b))[key];
  }

  // ── Merge ─────────────────────────────────────────────────────────────────

  /** Return a new Collection merging this and `other`. */
  merge(other: Collection<T> | T[]): Collection<T> {
    const arr = other instanceof Collection ? other.toArray() : other;
    return new Collection([...this.items, ...arr]);
  }

  // ── Side effects ──────────────────────────────────────────────────────────

  /** Execute `fn` for each item (returns `this` for chaining). */
  each(fn: (item: T, index: number) => void): this {
    this.items.forEach(fn);
    return this;
  }

  // ── Serialisation ─────────────────────────────────────────────────────────

  toJSON(): T[] {
    return this.toArray();
  }

  toString(): string {
    return JSON.stringify(this.items);
  }
}
