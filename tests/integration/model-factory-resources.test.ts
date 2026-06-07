import { ConnectionManager } from '../../src/connection/ConnectionManager';
import { Schema } from '../../src/schema/Schema';
import { SQLiteSchemaGrammar } from '../../src/schema/grammars/SQLiteSchemaGrammar';
import { Model } from '../../src/model/Model';
import { table } from '../../src/model/decorators/table';
import { fillable } from '../../src/model/decorators/fillable';
import { Factory } from '../../src/factory/Factory';
import { Sequence } from '../../src/factory/Sequence';
import { Resource } from '../../src/resources/Resource';
import { ResourceCollection } from '../../src/resources/ResourceCollection';

// ── Model ─────────────────────────────────────────────────────────────────

@table({ name: 'fac_users', timestamps: false, connection: 'factory' })
@fillable(['name', 'email', 'age'])
class FacUser extends Model {
  declare name: string;
  declare email: string;
  declare age: number | null;
}

// ── Factory ───────────────────────────────────────────────────────────────

class FacUserFactory extends Factory<FacUser> {
  model = FacUser;

  definition() {
    return { name: 'Test User', email: 'test@example.com', age: 25 };
  }
}

// ── Resources ─────────────────────────────────────────────────────────────

class FacUserResource extends Resource<FacUser> {
  toArray(): Record<string, unknown> {
    return {
      id: this.resource._attributes.id,
      name: this.resource._attributes.name,
    };
  }
}

class FacUserResourceWithConditionals extends Resource<FacUser> {
  toArray(): Record<string, unknown> {
    return {
      id: this.resource._attributes.id,
      name: this.resource._attributes.name,
      ...this.mergeWhen(true, { meta: 1 }),
    };
  }
}

class FacUserResourceWhenLoaded extends Resource<FacUser> {
  toArray(): Record<string, unknown> {
    return {
      id: this.resource._attributes.id,
      posts: this.whenLoaded('posts', () => ['post1', 'post2']),
    };
  }
}

// ── Setup ─────────────────────────────────────────────────────────────────

const CONN = 'factory';

beforeAll(async () => {
  ConnectionManager.addConnection(CONN, { driver: 'sqlite', filename: ':memory:' });
  Schema.useGrammar(new SQLiteSchemaGrammar());
  await Schema.create(
    'fac_users',
    (t) => {
      t.increments('id');
      t.string('name');
      t.string('email');
      t.integer('age').nullable();
    },
    CONN,
  );
});

afterAll(async () => {
  await ConnectionManager.getConnection(CONN).disconnect();
});

beforeEach(async () => {
  await ConnectionManager.getConnection(CONN).query('DELETE FROM fac_users', []);
});

// ── Factory tests ─────────────────────────────────────────────────────────

describe('Factory.make', () => {
  it('returns an unsaved instance with definition attributes', async () => {
    const user = await new FacUserFactory().make();
    expect(user).toBeInstanceOf(FacUser);
    expect(user._attributes.name).toBe('Test User');
    expect(user._attributes.id).toBeUndefined();
  });

  it('does not persist to the database', async () => {
    await new FacUserFactory().make();
    const result = await ConnectionManager.getConnection(CONN).query(
      'SELECT * FROM fac_users',
      [],
    );
    expect((result as any).rows.length).toBe(0);
  });
});

describe('Factory.create', () => {
  it('persists to DB and returns model with id', async () => {
    const user = await new FacUserFactory().create();
    expect(user).toBeInstanceOf(FacUser);
    expect(user._attributes.id).toBeDefined();
    expect(user._attributes.name).toBe('Test User');
  });

  it('count(3).create() creates 3 records', async () => {
    const users = await new FacUserFactory().count(3).create();
    expect(Array.isArray(users)).toBe(true);
    expect((users as FacUser[]).length).toBe(3);
    const result = await ConnectionManager.getConnection(CONN).query(
      'SELECT * FROM fac_users',
      [],
    );
    expect((result as any).rows.length).toBe(3);
  });
});

describe('Factory.state', () => {
  it('overrides definition attributes', async () => {
    const user = await new FacUserFactory().state({ age: 99 }).create();
    expect((user as FacUser)._attributes.age).toBe(99);
  });

  it('supports a function state receiving index', async () => {
    const users = await new FacUserFactory()
      .count(2)
      .state((i) => ({ name: `User ${i}` }))
      .create();
    const arr = users as FacUser[];
    expect(arr[0]._attributes.name).toBe('User 0');
    expect(arr[1]._attributes.name).toBe('User 1');
  });
});

describe('Factory.sequence', () => {
  it('alternates attributes across created records', async () => {
    const users = await new FacUserFactory()
      .count(2)
      .sequence({ name: 'User 1' }, { name: 'User 2' })
      .create();
    const arr = users as FacUser[];
    expect(arr[0]._attributes.name).toBe('User 1');
    expect(arr[1]._attributes.name).toBe('User 2');
  });

  it('wraps around when count exceeds sequence length', async () => {
    const users = await new FacUserFactory()
      .count(3)
      .sequence({ name: 'A' }, { name: 'B' })
      .create();
    const arr = users as FacUser[];
    expect(arr[0]._attributes.name).toBe('A');
    expect(arr[1]._attributes.name).toBe('B');
    expect(arr[2]._attributes.name).toBe('A');
  });
});

describe('Factory.afterMaking', () => {
  it('calls callback after make with the instance', async () => {
    const called: FacUser[] = [];
    const user = await new FacUserFactory()
      .afterMaking((u) => {
        called.push(u);
      })
      .make();
    expect(called).toHaveLength(1);
    expect(called[0]).toBe(user);
  });
});

describe('Factory.afterCreating', () => {
  it('calls callback after create with the instance', async () => {
    const called: FacUser[] = [];
    const user = await new FacUserFactory()
      .afterCreating((u) => {
        called.push(u);
      })
      .create();
    expect(called).toHaveLength(1);
    expect(called[0]).toBe(user);
  });
});

describe('Factory.trashed', () => {
  it('sets deleted_at attribute on the made instance', async () => {
    const user = await new FacUserFactory().trashed().make();
    expect((user as FacUser)._attributes.deleted_at).toBeDefined();
  });
});

// ── Sequence unit tests ───────────────────────────────────────────────────

describe('Sequence', () => {
  it('throws when constructed with no items', () => {
    expect(() => new Sequence()).toThrow('Sequence requires at least one item.');
  });

  it('cycles through items', () => {
    const seq = new Sequence({ name: 'A' }, { name: 'B' });
    expect(seq.next()).toEqual({ name: 'A' });
    expect(seq.next()).toEqual({ name: 'B' });
    expect(seq.next()).toEqual({ name: 'A' });
  });

  it('exposes index', () => {
    const seq = new Sequence({ x: 1 });
    expect(seq.index).toBe(0);
    seq.next();
    expect(seq.index).toBe(1);
  });

  it('resets index to 0', () => {
    const seq = new Sequence({ x: 1 });
    seq.next();
    seq.next();
    seq.reset();
    expect(seq.index).toBe(0);
  });

  it('supports function items receiving the sequence', () => {
    const seq = new Sequence((s) => ({ count: s.index }));
    // index is already incremented when the function is called
    expect(seq.next()).toEqual({ count: 1 });
    expect(seq.next()).toEqual({ count: 2 });
  });
});

// ── Resource tests ────────────────────────────────────────────────────────

describe('Resource.make / resolve', () => {
  it('serializes the model via toArray()', async () => {
    const user = await new FacUserFactory().create();
    const u = user as FacUser;
    const result = FacUserResource.make(u).resolve();
    expect(result).toEqual({ id: u._attributes.id, name: u._attributes.name });
  });
});

describe('Resource.collection / resolveData', () => {
  it('returns an array of serialized objects', async () => {
    const users = await new FacUserFactory().count(2).create();
    const arr = users as FacUser[];
    const col = FacUserResource.collection(arr);
    const data = col.resolveData();
    expect(data).toHaveLength(2);
    expect(data[0]).toHaveProperty('id');
    expect(data[0]).toHaveProperty('name');
  });

  it('toResponse wraps in data key', async () => {
    const users = await new FacUserFactory().count(2).create();
    const arr = users as FacUser[];
    const resp = FacUserResource.collection(arr).toResponse();
    expect(resp).toHaveProperty('data');
    expect(Array.isArray(resp.data)).toBe(true);
  });
});

describe('Resource.when', () => {
  it('includes field when condition is true', async () => {
    const user = await new FacUserFactory().create();
    const u = user as FacUser;

    class CondResource extends Resource<FacUser> {
      toArray() {
        return {
          id: this.resource._attributes.id,
          extra: this.when(true, 'yes'),
        };
      }
    }

    const result = CondResource.make(u).resolve();
    expect(result).toHaveProperty('extra', 'yes');
  });

  it('omits field when condition is false', async () => {
    const user = await new FacUserFactory().create();
    const u = user as FacUser;

    class CondResource extends Resource<FacUser> {
      toArray() {
        return {
          id: this.resource._attributes.id,
          extra: this.when(false, 'yes'),
        };
      }
    }

    const result = CondResource.make(u).resolve();
    expect(result).not.toHaveProperty('extra');
  });
});

describe('Resource.whenLoaded', () => {
  it('includes value when relation is loaded', async () => {
    const user = await new FacUserFactory().create();
    const u = user as FacUser;
    (u as any)._relations = { posts: [] };

    const result = FacUserResourceWhenLoaded.make(u).resolve();
    expect(result).toHaveProperty('posts');
    expect(result.posts).toEqual(['post1', 'post2']);
  });

  it('omits value when relation is not loaded', async () => {
    const user = await new FacUserFactory().create();
    const u = user as FacUser;

    const result = FacUserResourceWhenLoaded.make(u).resolve();
    expect(result).not.toHaveProperty('posts');
  });
});

describe('Resource.mergeWhen', () => {
  it('merges attributes when condition is true', async () => {
    const user = await new FacUserFactory().create();
    const u = user as FacUser;

    const result = FacUserResourceWithConditionals.make(u).resolve();
    expect(result).toHaveProperty('meta', 1);
  });

  it('omits merged attributes when condition is false', async () => {
    const user = await new FacUserFactory().create();
    const u = user as FacUser;

    class NoMergeResource extends Resource<FacUser> {
      toArray() {
        return {
          id: this.resource._attributes.id,
          ...this.mergeWhen(false, { secret: 'hidden' }),
        };
      }
    }

    const result = NoMergeResource.make(u).resolve();
    expect(result).not.toHaveProperty('secret');
  });
});

describe('Resource.toResponse', () => {
  it('wraps resolved data in a data envelope by default', async () => {
    const user = await new FacUserFactory().create();
    const u = user as FacUser;
    const resp = FacUserResource.make(u).toResponse();
    expect(resp).toHaveProperty('data');
    expect((resp.data as Record<string, unknown>).name).toBe(u._attributes.name);
  });

  it('merges additional top-level keys', async () => {
    const user = await new FacUserFactory().create();
    const u = user as FacUser;
    const resp = FacUserResource.make(u).additional({ version: 2 }).toResponse();
    expect(resp).toHaveProperty('version', 2);
  });
});

describe('Resource.withoutWrapping', () => {
  afterEach(() => {
    Resource.withoutWrapping(false);
  });

  it('returns data without data envelope when withoutWrapping is set', async () => {
    Resource.withoutWrapping(true);
    const user = await new FacUserFactory().create();
    const u = user as FacUser;
    const resp = FacUserResource.make(u).toResponse();
    expect(resp).not.toHaveProperty('data');
    expect(resp).toHaveProperty('name');
  });
});

describe('ResourceCollection.additional', () => {
  it('merges extra keys into the response envelope', async () => {
    const user = await new FacUserFactory().create();
    const arr = [user as FacUser];
    const resp = FacUserResource.collection(arr).additional({ total: 99 }).toResponse();
    expect(resp).toHaveProperty('total', 99);
  });
});

describe('ResourceCollection.wrap', () => {
  it('uses a custom wrap key', async () => {
    const user = await new FacUserFactory().create();
    const arr = [user as FacUser];
    const resp = FacUserResource.collection(arr).wrap('items').toResponse();
    expect(resp).toHaveProperty('items');
    expect(resp).not.toHaveProperty('data');
  });
});
