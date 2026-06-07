/**
 * Tests for Model attribute casting.
 * Uses Model.hydrate() to get a proxied instance — no DB calls needed.
 */
import { Model } from '../../src/model/Model';
import { casts } from '../../src/model/decorators/cast';
import { table } from '../../src/model/decorators/table';

@table({ name: 'typed_models', timestamps: false })
@casts({
  flag: 'boolean',
  qty: 'number',
  metadata: 'json',
  started_at: 'date',
  code: 'string',
})
class TypedModel extends Model {}

describe('Model attribute casting — _castGet()', () => {
  // ── boolean ────────────────────────────────────────────────────────────────

  it("casts 'boolean': '1' → true", () => {
    const m = TypedModel.hydrate({ flag: '1' }) as any;
    expect(m.flag).toBe(true);
  });

  it("casts 'boolean': 0 → false", () => {
    const m = TypedModel.hydrate({ flag: 0 }) as any;
    expect(m.flag).toBe(false);
  });

  it("casts 'boolean': true stays true", () => {
    const m = TypedModel.hydrate({ flag: true }) as any;
    expect(m.flag).toBe(true);
  });

  // ── number ─────────────────────────────────────────────────────────────────

  it("casts 'number': '42' → 42", () => {
    const m = TypedModel.hydrate({ qty: '42' }) as any;
    expect(m.qty).toBe(42);
  });

  it("casts 'number': 3.14 stays 3.14", () => {
    const m = TypedModel.hydrate({ qty: 3.14 }) as any;
    expect(m.qty).toBe(3.14);
  });

  // ── json ───────────────────────────────────────────────────────────────────

  it("casts 'json': JSON string → object", () => {
    const m = TypedModel.hydrate({ metadata: '{"foo":"bar"}' }) as any;
    expect(m.metadata).toEqual({ foo: 'bar' });
  });

  it("casts 'json': object stays object (no double parse)", () => {
    const m = TypedModel.hydrate({ metadata: { x: 1 } }) as any;
    expect(m.metadata).toEqual({ x: 1 });
  });

  // ── date ───────────────────────────────────────────────────────────────────

  it("casts 'date': ISO string → Date instance", () => {
    const m = TypedModel.hydrate({ started_at: '2024-01-15T10:00:00.000Z' }) as any;
    expect(m.started_at).toBeInstanceOf(Date);
  });

  it("casts 'date': Date stays Date", () => {
    const d = new Date('2024-03-01');
    const m = TypedModel.hydrate({ started_at: d }) as any;
    expect(m.started_at).toBeInstanceOf(Date);
  });

  // ── string ─────────────────────────────────────────────────────────────────

  it("casts 'string': number → string", () => {
    const m = TypedModel.hydrate({ code: 42 }) as any;
    expect(m.code).toBe('42');
  });

  it("casts 'string': boolean → string", () => {
    const m = TypedModel.hydrate({ code: true }) as any;
    expect(typeof m.code).toBe('string');
  });

  // ── null / undefined passthrough ───────────────────────────────────────────

  it('returns null as-is regardless of cast type', () => {
    const m = TypedModel.hydrate({ flag: null }) as any;
    expect(m.flag).toBeNull();
  });

  it('returns undefined as-is regardless of cast type', () => {
    const m = TypedModel.hydrate({ qty: undefined }) as any;
    expect(m.qty).toBeUndefined();
  });
});

describe('Model _castSet() — json cast stores as string on set', () => {
  it('serializes object to JSON string when assigning via proxy', () => {
    const m = TypedModel.newInstance({ metadata: '{}' }) as any;
    m.metadata = { hello: 'world' };
    // The raw attribute should now be a JSON string
    expect(typeof m._attributes.metadata).toBe('string');
    expect(JSON.parse(m._attributes.metadata)).toEqual({ hello: 'world' });
  });
});

describe('decimal: parameterised cast', () => {
  @table({ name: 'price_models', timestamps: false })
  @casts({ price: 'decimal:2' })
  class PriceModel extends Model {}

  it("'decimal:2' rounds to 2 decimal places", () => {
    const m = PriceModel.hydrate({ price: 3.14159 }) as any;
    expect(m.price).toBe(3.14);
  });

  it("'decimal:2' works on string input", () => {
    const m = PriceModel.hydrate({ price: '9.9999' }) as any;
    expect(m.price).toBe(10.00);
  });
});
