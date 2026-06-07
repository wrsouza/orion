/**
 * Tests for dirty tracking in Model (via Proxy).
 * No DB required — we use Model.hydrate() and Model.newInstance().
 */
import { Model } from '../../src/model/Model';
import { table } from '../../src/model/decorators/table';
import { casts } from '../../src/model/decorators/cast';

@table({ name: 'dirty_users', timestamps: false })
@casts({})
class DirtyUser extends Model {
  declare name: string;
  declare email: string;
}

describe('dirty tracking', () => {
  // ── isDirty / isClean ──────────────────────────────────────────────────────

  it('new instance (no original) is dirty for all set attributes', () => {
    const m = DirtyUser.newInstance({ name: 'Alice' }) as any;
    expect(m.isDirty()).toBe(true);
  });

  it('hydrated model with no changes is clean', () => {
    const m = DirtyUser.hydrate({ name: 'Alice', email: 'a@example.com' }) as any;
    expect(m.isDirty()).toBe(false);
    expect(m.isClean()).toBe(true);
  });

  it('isDirty() returns true after changing an attribute', () => {
    const m = DirtyUser.hydrate({ name: 'Alice', email: 'a@example.com' }) as any;
    m.name = 'Bob';
    expect(m.isDirty()).toBe(true);
  });

  it("isDirty('field') returns true for the changed field", () => {
    const m = DirtyUser.hydrate({ name: 'Alice', email: 'a@example.com' }) as any;
    m.name = 'Bob';
    expect(m.isDirty('name')).toBe(true);
    expect(m.isDirty('email')).toBe(false);
  });

  it("isClean('field') returns true for unchanged field", () => {
    const m = DirtyUser.hydrate({ name: 'Alice', email: 'a@example.com' }) as any;
    m.name = 'Bob';
    expect(m.isClean('email')).toBe(true);
    expect(m.isClean('name')).toBe(false);
  });

  it('isDirty() returns false after restoring original value', () => {
    const m = DirtyUser.hydrate({ name: 'Alice' }) as any;
    m.name = 'Bob';
    m.name = 'Alice'; // restore
    expect(m.isDirty()).toBe(false);
  });

  // ── getDirtyAttributes ─────────────────────────────────────────────────────

  it('_getDirtyAttributes returns only changed fields', () => {
    const m = DirtyUser.hydrate({ name: 'Alice', email: 'a@example.com' }) as any;
    m.name = 'Bob';
    const dirty = m._getDirtyAttributes();
    expect(dirty).toHaveProperty('name', 'Bob');
    expect(dirty).not.toHaveProperty('email');
  });

  // ── getOriginal ────────────────────────────────────────────────────────────

  it('getOriginal() returns the snapshot from hydration', () => {
    const m = DirtyUser.hydrate({ name: 'Alice', email: 'a@example.com' }) as any;
    m.name = 'Bob';
    expect(m.getOriginal('name')).toBe('Alice');
    expect(m.getOriginal('email')).toBe('a@example.com');
  });

  it('getOriginal() with no arg returns whole original object', () => {
    const m = DirtyUser.hydrate({ name: 'Alice' }) as any;
    expect(m.getOriginal()).toEqual({ name: 'Alice' });
  });

  // ── wasChanged (after save mock) ──────────────────────────────────────────

  it('wasChanged() is false before any save', () => {
    const m = DirtyUser.hydrate({ name: 'Alice' }) as any;
    m.name = 'Bob';
    expect(m.wasChanged()).toBe(false);
  });

  it('wasChanged() is true after _syncChanges() (simulates post-save)', () => {
    const m = DirtyUser.hydrate({ name: 'Alice' }) as any;
    m.name = 'Bob';
    // Simulate what save() does internally
    m._syncChanges();
    m._syncOriginal();
    expect(m.wasChanged()).toBe(true);
    expect(m.wasChanged('name')).toBe(true);
    expect(m.wasChanged('email')).toBe(false);
  });

  it('isDirty() is false after _syncOriginal() (simulates post-save)', () => {
    const m = DirtyUser.hydrate({ name: 'Alice' }) as any;
    m.name = 'Bob';
    m._syncOriginal();
    expect(m.isDirty()).toBe(false);
  });

  // ── isDirty with array of fields ───────────────────────────────────────────

  it("isDirty(['name','email']) returns true if any of them changed", () => {
    const m = DirtyUser.hydrate({ name: 'Alice', email: 'a@example.com' }) as any;
    m.name = 'Bob';
    expect(m.isDirty(['name', 'email'])).toBe(true);
  });

  it("isDirty(['email']) returns false when only name changed", () => {
    const m = DirtyUser.hydrate({ name: 'Alice', email: 'a@example.com' }) as any;
    m.name = 'Bob';
    expect(m.isDirty(['email'])).toBe(false);
  });
});
