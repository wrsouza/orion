/**
 * Global registry that maps morph type strings to model classes and vice-versa.
 *
 * By default, the type column stores the model's class name (e.g. `'User'`).
 * Call `MorphMap.enforce()` to use shorter aliases instead.
 *
 * @example
 * ```ts
 * import { MorphMap } from 'orion';
 *
 * MorphMap.enforce({
 *   post:  Post,
 *   video: Video,
 * });
 *
 * // Now imageable_type stores 'post' / 'video' instead of 'Post' / 'Video'
 * ```
 */
export class MorphMap {
  private static readonly _map = new Map<string, Function>();
  private static readonly _reverse = new Map<Function, string>();

  /**
   * Register type-string → class mappings.
   * Can be called multiple times; later calls merge into the registry.
   */
  static enforce(map: Record<string, Function>): void {
    for (const [alias, klass] of Object.entries(map)) {
      this._map.set(alias, klass);
      this._reverse.set(klass, alias);
    }
  }

  /**
   * Return the model class for a stored type string.
   * Returns `null` when no alias is registered (caller should fall back to
   * dynamic class resolution or throw an error).
   */
  static resolve(typeString: string): Function | null {
    return this._map.get(typeString) ?? null;
  }

  /**
   * Return the type string to store in the database for a given model class.
   * Falls back to the class name when no alias has been registered.
   */
  static getAlias(modelClass: Function): string {
    return this._reverse.get(modelClass) ?? modelClass.name;
  }

  /** Return all registered type aliases. Used by `whereHasMorph('*')`. */
  static allAliases(): string[] {
    return [...this._map.keys()];
  }

  /** Clear the entire registry. Useful in tests. */
  static clear(): void {
    this._map.clear();
    this._reverse.clear();
  }
}
