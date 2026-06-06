/**
 * Wraps a raw SQL fragment that should be injected into a query verbatim,
 * bypassing parameter binding and identifier quoting.
 *
 * Obtain instances via the `raw()` helper rather than instantiating directly.
 *
 * @example
 * ```ts
 * builder.selectRaw('COUNT(*) as total')
 * builder.whereRaw('age > $1 AND active = $2', [18, true])
 * builder.orderByRaw('RANDOM()')
 * ```
 */
export class Expression {
  constructor(private readonly value: string) {}

  getValue(): string {
    return this.value;
  }

  toString(): string {
    return this.value;
  }
}

/** Convenience factory for raw SQL expressions. */
export function raw(sql: string): Expression {
  return new Expression(sql);
}
