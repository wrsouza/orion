/**
 * Tests for Model serialization: toArray(), attributesToArray(), @hidden, @visible, @appends.
 * No DB required.
 */
import { Model } from '../../src/model/Model';
import { table } from '../../src/model/decorators/table';
import { hidden, visible, appends, casts } from '../../src/model/decorators/cast';

// ── @hidden ────────────────────────────────────────────────────────────────

@table({ name: 'users_h', timestamps: false })
@hidden(['password', 'remember_token'])
class HiddenUser extends Model {
  declare name: string;
  declare email: string;
  declare password: string;
}

// ── @visible ───────────────────────────────────────────────────────────────

@table({ name: 'users_v', timestamps: false })
@visible(['id', 'name'])
class VisibleUser extends Model {
  declare id: number;
  declare name: string;
  declare email: string;
  declare password: string;
}

// ── @appends + getter accessor ─────────────────────────────────────────────

@table({ name: 'users_a', timestamps: false })
@appends(['full_name'])
class AppendUser extends Model {
  declare first_name: string;
  declare last_name: string;

  get full_name(): string {
    return `${this._attributes['first_name']} ${this._attributes['last_name']}`;
  }
}

// ── plain model (no special config) ───────────────────────────────────────

@table({ name: 'plain_models', timestamps: false })
class PlainModel extends Model {
  declare name: string;
  declare age: number;
}

// ── Helper ─────────────────────────────────────────────────────────────────

function hydrate<T extends Model>(
  Cls: { hydrate(row: Record<string, unknown>): T },
  attrs: Record<string, unknown>
): T {
  return Cls.hydrate(attrs);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('toArray() / attributesToArray()', () => {
  it('toArray() returns all attributes for plain model', () => {
    const m = hydrate(PlainModel, { name: 'Alice', age: 30 });
    const arr = m.toArray();
    expect(arr).toEqual({ name: 'Alice', age: 30 });
  });

  it('attributesToArray() does not include loaded relations', () => {
    const m = hydrate(PlainModel, { name: 'Alice', age: 30 });
    m.setRelation('posts', [{ id: 1 }]);
    const arr = m.attributesToArray();
    expect(arr).not.toHaveProperty('posts');
  });

  it('toArray() includes loaded relations', () => {
    const m = hydrate(PlainModel, { name: 'Alice', age: 30 });
    // Set a non-Model, non-Collection relation value (like a count)
    m.setRelation('posts_count', 5);
    const arr = m.toArray();
    expect(arr).toHaveProperty('posts_count', 5);
  });
});

describe('@hidden decorator', () => {
  it('excludes hidden columns from toArray()', () => {
    const m = hydrate(HiddenUser, {
      name: 'Alice',
      email: 'a@example.com',
      password: 'secret',
      remember_token: 'tok',
    });
    const arr = m.toArray();
    expect(arr).not.toHaveProperty('password');
    expect(arr).not.toHaveProperty('remember_token');
  });

  it('still includes non-hidden columns', () => {
    const m = hydrate(HiddenUser, {
      name: 'Alice',
      email: 'a@example.com',
      password: 'secret',
    });
    const arr = m.toArray();
    expect(arr).toHaveProperty('name', 'Alice');
    expect(arr).toHaveProperty('email', 'a@example.com');
  });

  it('makeVisible() overrides @hidden for a specific instance', () => {
    const m = hydrate(HiddenUser, { name: 'Alice', password: 'secret' });
    const arr = m.makeVisible('password').toArray();
    expect(arr).toHaveProperty('password', 'secret');
  });

  it('makeHidden() hides an additional column for this instance', () => {
    const m = hydrate(HiddenUser, { name: 'Alice', email: 'a@example.com', password: 'x' });
    const arr = m.makeHidden('email').toArray();
    expect(arr).not.toHaveProperty('email');
  });
});

describe('@visible decorator', () => {
  it('only exposes listed columns', () => {
    const m = hydrate(VisibleUser, {
      id: 1,
      name: 'Bob',
      email: 'b@example.com',
      password: 'secret',
    });
    const arr = m.toArray();
    expect(arr).toHaveProperty('id', 1);
    expect(arr).toHaveProperty('name', 'Bob');
    expect(arr).not.toHaveProperty('email');
    expect(arr).not.toHaveProperty('password');
  });
});

describe('@appends + getter', () => {
  it('includes appended virtual field in toArray()', () => {
    const m = hydrate(AppendUser, { first_name: 'John', last_name: 'Doe' });
    const arr = m.toArray();
    expect(arr).toHaveProperty('full_name', 'John Doe');
  });

  it('withoutAppends() removes virtual fields', () => {
    const m = hydrate(AppendUser, { first_name: 'John', last_name: 'Doe' });
    const arr = m.withoutAppends().toArray();
    expect(arr).not.toHaveProperty('full_name');
  });

  it('append() adds extra virtual field at runtime', () => {
    const m = hydrate(PlainModel, { name: 'Alice', age: 30 }) as any;
    // Add a getter dynamically
    Object.defineProperty(Object.getPrototypeOf(m), 'upper_name', {
      get() {
        return (this._attributes['name'] as string).toUpperCase();
      },
      configurable: true,
    });
    const arr = m.append('upper_name').toArray();
    expect(arr).toHaveProperty('upper_name', 'ALICE');
  });
});

describe('toJSON()', () => {
  it('toJSON() returns same as toArray()', () => {
    const m = hydrate(PlainModel, { name: 'Alice', age: 30 });
    expect(m.toJSON()).toEqual(m.toArray());
  });
});
