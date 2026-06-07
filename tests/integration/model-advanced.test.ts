import { ConnectionManager } from '../../src/connection/ConnectionManager';
import { Schema } from '../../src/schema/Schema';
import { SQLiteSchemaGrammar } from '../../src/schema/grammars/SQLiteSchemaGrammar';
import { Model } from '../../src/model/Model';
import { table } from '../../src/model/decorators/table';
import { fillable } from '../../src/model/decorators/fillable';

// ── Model definition ──────────────────────────────────────────────────────

const CONN = 'advanced';

@table({ name: 'adv_users', timestamps: true, connection: CONN })
@fillable(['name', 'email', 'age', 'status'])
class User extends Model {
  declare name: string;
  declare email: string;
  declare age: number | null;
  declare status: string;
}

// ── Setup ─────────────────────────────────────────────────────────────────

beforeAll(async () => {
  ConnectionManager.addConnection(CONN, { driver: 'sqlite', filename: ':memory:' });
  Schema.useGrammar(new SQLiteSchemaGrammar());
  await Schema.create(
    'adv_users',
    (t) => {
      t.increments('id');
      t.string('name');
      t.string('email').unique();
      t.integer('age').nullable();
      t.string('status').default('active');
      t.timestamps();
    },
    CONN,
  );
});

afterAll(async () => {
  await ConnectionManager.getConnection(CONN).disconnect();
});

beforeEach(async () => {
  await ConnectionManager.getConnection(CONN).query('DELETE FROM adv_users', []);
});

// ── firstOrCreate ─────────────────────────────────────────────────────────

describe('User.firstOrCreate', () => {
  it('returns existing record when found', async () => {
    await User.create({ name: 'Alice', email: 'a@b.com', status: 'active' });
    const user = await User.firstOrCreate({ email: 'a@b.com' }, { name: 'Other' });
    expect(user.name).toBe('Alice');
    expect(user.exists).toBe(true);
    const count = await User.query().count();
    expect(count).toBe(1);
  });

  it('creates a new record when not found and sets wasRecentlyCreated', async () => {
    const user = await User.firstOrCreate({ email: 'new@b.com' }, { name: 'New', status: 'active' });
    expect(user.exists).toBe(true);
    expect(user.wasRecentlyCreated).toBe(true);
    expect(user.name).toBe('New');
    expect(user.email).toBe('new@b.com');
  });
});

// ── updateOrCreate ────────────────────────────────────────────────────────

describe('User.updateOrCreate', () => {
  it('updates existing record', async () => {
    await User.create({ name: 'Alice', email: 'a@b.com', status: 'active' });
    const user = await User.updateOrCreate({ email: 'a@b.com' }, { name: 'Updated' });
    expect(user.name).toBe('Updated');
    expect(user.exists).toBe(true);
    const count = await User.query().count();
    expect(count).toBe(1);
  });

  it('creates a new record when not found', async () => {
    const user = await User.updateOrCreate(
      { email: 'fresh@b.com' },
      { name: 'Fresh', status: 'active' },
    );
    expect(user.exists).toBe(true);
    expect(user.wasRecentlyCreated).toBe(true);
    expect(user.email).toBe('fresh@b.com');
  });
});

// ── firstOrNew ────────────────────────────────────────────────────────────

describe('User.firstOrNew', () => {
  it('returns an unsaved instance when not found', async () => {
    const user = await User.firstOrNew({ email: 'x@b.com' });
    expect(user.exists).toBe(false);
    expect(user._attributes.email).toBe('x@b.com');
  });

  it('returns existing record when found', async () => {
    await User.create({ name: 'Bob', email: 'bob@b.com', status: 'active' });
    const user = await User.firstOrNew({ email: 'bob@b.com' });
    expect(user.exists).toBe(true);
    expect(user.name).toBe('Bob');
  });
});

// ── Paginator ─────────────────────────────────────────────────────────────

describe('User.query().paginate()', () => {
  beforeEach(async () => {
    for (let i = 1; i <= 5; i++) {
      await User.create({ name: `User${i}`, email: `u${i}@b.com`, age: 20 + i, status: 'active' });
    }
  });

  it('returns correct Paginator metadata', async () => {
    const page = await User.query().paginate(2, 1);
    expect(page.total).toBe(5);
    expect(page.perPage).toBe(2);
    expect(page.currentPage).toBe(1);
    expect(page.lastPage).toBe(3);
    expect(page.hasMorePages).toBe(true);
    expect(page.from).toBe(1);
    expect(page.to).toBe(2);
    expect(page.data.length).toBe(2);
  });

  it('returns last page correctly', async () => {
    const page = await User.query().paginate(2, 3);
    expect(page.currentPage).toBe(3);
    expect(page.hasMorePages).toBe(false);
    expect(page.data.length).toBe(1);
    expect(page.from).toBe(5);
    expect(page.to).toBe(5);
  });

  it('serialises to JSON', async () => {
    const page = await User.query().paginate(2, 1);
    const json = page.toJSON();
    expect(json.total).toBe(5);
    expect(Array.isArray(json.data)).toBe(true);
  });
});

// ── SimplePaginator ───────────────────────────────────────────────────────

describe('User.query().simplePaginate()', () => {
  beforeEach(async () => {
    for (let i = 1; i <= 5; i++) {
      await User.create({ name: `SU${i}`, email: `su${i}@b.com`, status: 'active' });
    }
  });

  it('returns hasMorePages=true when more rows exist', async () => {
    const page = await User.query().simplePaginate(2, 1);
    expect(page.perPage).toBe(2);
    expect(page.currentPage).toBe(1);
    expect(page.hasMorePages).toBe(true);
    expect(page.data.length).toBe(2);
  });

  it('returns hasMorePages=false on last page', async () => {
    const page = await User.query().simplePaginate(3, 2);
    expect(page.hasMorePages).toBe(false);
    expect(page.data.length).toBe(2);
  });

  it('serialises to JSON', async () => {
    const page = await User.query().simplePaginate(2, 1);
    const json = page.toJSON();
    expect(json.hasMorePages).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
  });
});

// ── Aggregate methods ─────────────────────────────────────────────────────

describe('aggregate methods', () => {
  beforeEach(async () => {
    await User.create({ name: 'A', email: 'ag1@b.com', age: 20, status: 'active' });
    await User.create({ name: 'B', email: 'ag2@b.com', age: 30, status: 'active' });
    await User.create({ name: 'C', email: 'ag3@b.com', age: 25, status: 'active' });
  });

  it('count() returns number of rows', async () => {
    const n = await User.query().count();
    expect(n).toBe(3);
  });

  it('sum() returns summed value', async () => {
    const s = await User.query().sum('age');
    expect(s).toBe(75);
  });

  it('avg() returns average value', async () => {
    const a = await User.query().avg('age');
    expect(a).toBeCloseTo(25, 1);
  });

  it('max() returns maximum value', async () => {
    const m = await User.query().max('age');
    expect(m).toBe(30);
  });

  it('min() returns minimum value', async () => {
    const m = await User.query().min('age');
    expect(m).toBe(20);
  });
});

// ── increment / decrement on builder ─────────────────────────────────────

describe('builder increment / decrement', () => {
  it('increments a column value', async () => {
    const user = await User.create({ name: 'Inc', email: 'inc@b.com', age: 10, status: 'active' });
    await User.query().where('id', user._attributes.id).increment('age', 5);
    const fresh = await User.find(user._attributes.id);
    expect(Number(fresh!._attributes.age)).toBe(15);
  });

  it('decrements a column value', async () => {
    const user = await User.create({ name: 'Dec', email: 'dec@b.com', age: 10, status: 'active' });
    await User.query().where('id', user._attributes.id).decrement('age', 3);
    const fresh = await User.find(user._attributes.id);
    expect(Number(fresh!._attributes.age)).toBe(7);
  });
});

// ── chunk ─────────────────────────────────────────────────────────────────

describe('chunk()', () => {
  it('processes rows in batches of given size', async () => {
    for (let i = 1; i <= 5; i++) {
      await User.create({ name: `Ch${i}`, email: `ch${i}@b.com`, status: 'active' });
    }

    const batches: number[] = [];
    await User.query().chunk(2, async (batch) => {
      batches.push(batch.length);
    });

    expect(batches.length).toBe(3); // [2, 2, 1]
    expect(batches[0]).toBe(2);
    expect(batches[2]).toBe(1);
  });

  it('stops processing when callback returns false', async () => {
    for (let i = 1; i <= 6; i++) {
      await User.create({ name: `St${i}`, email: `st${i}@b.com`, status: 'active' });
    }

    let processed = 0;
    await User.query().chunk(2, async (batch) => {
      processed += batch.length;
      return false; // stop after first batch
    });

    expect(processed).toBe(2);
  });
});

// ── lazy (async generator) ────────────────────────────────────────────────

describe('lazy()', () => {
  it('yields all models one at a time', async () => {
    for (let i = 1; i <= 4; i++) {
      await User.create({ name: `Lz${i}`, email: `lz${i}@b.com`, status: 'active' });
    }

    const results: string[] = [];
    for await (const user of User.query().lazy(2)) {
      results.push((user as any)._attributes.name);
    }

    expect(results.length).toBe(4);
  });
});

// ── withoutTimestamps ─────────────────────────────────────────────────────

describe('withoutTimestamps()', () => {
  it('does not set created_at / updated_at when disabled', async () => {
    let capturedUser: User | null = null;
    await User.withoutTimestamps(async () => {
      capturedUser = await User.create({
        name: 'NoTS',
        email: 'nots@b.com',
        status: 'active',
      });
    });
    expect(capturedUser).not.toBeNull();
    expect((capturedUser as any)._attributes.created_at).toBeUndefined();
    expect((capturedUser as any)._attributes.updated_at).toBeUndefined();
  });
});

// ── replicate ─────────────────────────────────────────────────────────────

describe('model.replicate()', () => {
  it('creates an unsaved copy without id or timestamps', async () => {
    const user = await User.create({ name: 'Rep', email: 'rep@b.com', age: 25, status: 'active' });
    const copy = user.replicate();
    expect(copy.exists).toBe(false);
    expect(copy._attributes.id).toBeUndefined();
    expect(copy._attributes.name).toBe('Rep');
    expect(copy._attributes.age).toBe(25);
    expect(copy._attributes.created_at).toBeUndefined();
  });
});

// ── is / isNot ────────────────────────────────────────────────────────────

describe('model.is() / model.isNot()', () => {
  it('is() returns true for same row', async () => {
    const a = await User.create({ name: 'IsA', email: 'isa@b.com', status: 'active' });
    const b = await User.find(a._attributes.id);
    expect(a.is(b!)).toBe(true);
    expect(a.isNot(b!)).toBe(false);
  });

  it('isNot() returns true for different rows', async () => {
    const a = await User.create({ name: 'IsA2', email: 'isa2@b.com', status: 'active' });
    const b = await User.create({ name: 'IsB2', email: 'isb2@b.com', status: 'active' });
    expect(a.isNot(b)).toBe(true);
    expect(a.is(b)).toBe(false);
  });
});

// ── wasRecentlyCreated ────────────────────────────────────────────────────

describe('wasRecentlyCreated', () => {
  it('is true after create()', async () => {
    const user = await User.create({ name: 'WRC', email: 'wrc@b.com', status: 'active' });
    expect(user.wasRecentlyCreated).toBe(true);
  });

  it('is false after find()', async () => {
    const created = await User.create({ name: 'WRC2', email: 'wrc2@b.com', status: 'active' });
    const found = await User.find(created._attributes.id);
    expect(found!.wasRecentlyCreated).toBe(false);
  });
});

// ── whereBetween / whereIn ────────────────────────────────────────────────

describe('whereBetween / whereIn', () => {
  beforeEach(async () => {
    await User.create({ name: 'WB1', email: 'wb1@b.com', age: 15, status: 'active' });
    await User.create({ name: 'WB2', email: 'wb2@b.com', age: 25, status: 'active' });
    await User.create({ name: 'WB3', email: 'wb3@b.com', age: 35, status: 'pending' });
  });

  it('whereBetween filters rows in range', async () => {
    const results = await User.query().whereBetween('age', [18, 30]).get();
    expect(results.length).toBe(1);
    expect((results.first() as any)._attributes.name).toBe('WB2');
  });

  it('whereIn filters rows matching list', async () => {
    const results = await User.query().whereIn('status', ['active', 'pending']).get();
    expect(results.length).toBe(3);
  });

  it('whereIn with subset filters correctly', async () => {
    const results = await User.query().whereIn('status', ['pending']).get();
    expect(results.length).toBe(1);
    expect((results.first() as any)._attributes.name).toBe('WB3');
  });
});

// ── latest() ─────────────────────────────────────────────────────────────

describe('latest()', () => {
  it('returns most recently inserted record first', async () => {
    await User.create({ name: 'Old', email: 'old@b.com', status: 'active' });
    await User.create({ name: 'New', email: 'new@b.com', status: 'active' });

    const first = await User.query().latest('id').first();
    expect((first as any)._attributes.name).toBe('New');
  });
});

// ── User.all() → Collection ───────────────────────────────────────────────

describe('User.all()', () => {
  beforeEach(async () => {
    await User.create({ name: 'AllA', email: 'alla@b.com', age: 10, status: 'active' });
    await User.create({ name: 'AllB', email: 'allb@b.com', age: 20, status: 'inactive' });
    await User.create({ name: 'AllC', email: 'allc@b.com', age: 30, status: 'active' });
  });

  it('returns a Collection with first() and last()', async () => {
    const users = await User.all();
    expect(users.length).toBe(3);
    expect(users.first()).toBeDefined();
    expect(users.last()).toBeDefined();
  });

  it('filter() narrows results', async () => {
    const users = await User.all();
    const active = users.filter((u) => (u as any)._attributes.status === 'active');
    expect(active.length).toBe(2);
  });

  it('map() transforms results', async () => {
    const users = await User.all();
    const names = users.map((u) => (u as any)._attributes.name);
    expect(names).toContain('AllA');
    expect(names).toContain('AllB');
    expect(names).toContain('AllC');
  });

  it('pluck() extracts a column as array', async () => {
    const users = await User.all();
    const emails = users.pluck('email');
    expect(emails).toContain('alla@b.com');
    expect(emails.length).toBe(3);
  });
});
