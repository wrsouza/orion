export class Sequence {
  private _items: Array<Record<string, unknown> | ((seq: Sequence) => Record<string, unknown>)>;
  private _index = 0;

  constructor(
    ...items: Array<Record<string, unknown> | ((seq: Sequence) => Record<string, unknown>)>
  ) {
    if (items.length === 0) throw new Error('Sequence requires at least one item.');
    this._items = items;
  }

  /** The number of times `next()` has been called so far (0-based). */
  get index(): number {
    return this._index;
  }

  next(): Record<string, unknown> {
    const item = this._items[this._index % this._items.length];
    this._index++;
    return typeof item === 'function' ? item(this) : item;
  }

  reset(): void {
    this._index = 0;
  }
}
