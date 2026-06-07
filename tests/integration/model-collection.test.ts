import { ConnectionManager } from '../../src/connection/ConnectionManager';
import { Schema } from '../../src/schema/Schema';
import { SQLiteSchemaGrammar } from '../../src/schema/grammars/SQLiteSchemaGrammar';
import { Model } from '../../src/model/Model';
import { table } from '../../src/model/decorators/table';
import { fillable } from '../../src/model/decorators/fillable';
import { Collection } from '../../src/model/Collection';
import { ModelCollection } from '../../src/model/ModelCollection';

// ── Model definition ──────────────────────────────────────────────────────

@table({ name: 'col_users', timestamps: false, connection: 'collection' })
@fillable(['name', 'role', 'score'])
class ColUser extends Model {
  declare name: string;
  declare role: string;
  declare score: number;
}

// ── Setup ─────────────────────────────────────────────────────────────────

const CONN = 'collection';

beforeAll(async () => {
  ConnectionManager.addConnection(CONN, { driver: 'sqlite', filename: ':memory:' });
  Schema.useGrammar(new SQLiteSchemaGrammar());
  await Schema.create(
    'col_users',
    (t) => {
      t.increments('id');
      t.string('name');
      t.string('role').default('user');
      t.integer('score').default(0);
    },
    CONN
  );
});

afterAll(async () => {
  await ConnectionManager.getConnection(CONN).disconnect();
});

beforeEach(async () => {
  await ConnectionManager.getConnection(CONN).query('DELETE FROM col_users', []);
});

// ── Helpers ───────────────────────────────────────────────────────────────

async function seedUsers() {
  const alice = await ColUser.create({ name: 'Alice', role: 'admin', score: 90 });
  const bob = await ColUser.create({ name: 'Bob', role: 'user', score: 50 });
  const carol = await ColUser.create({ name: 'Carol', role: 'user', score: 70 });
  return { alice, bob, carol };
}

// ── Collection<T> tests ───────────────────────────────────────────────────

describe('Collection<T>', () => {
  describe('first() / last()', () => {
    it('returns first and last items', () => {
      const col = new Collection([1, 2, 3]);
      expect(col.first()).toBe(1);
      expect(col.last()).toBe(3);
    });

    it('returns undefined for empty collection', () => {
      const col = new Collection<number>();
      expect(col.first()).toBeUndefined();
      expect(col.last()).toBeUndefined();
    });

    it('first(predicate) returns matching item', () => {
      const col = new Collection([1, 2, 3, 4]);
      expect(col.first((x) => x > 2)).toBe(3);
    });

    it('last(predicate) returns last matching item', () => {
      const col = new Collection([1, 2, 3, 4]);
      expect(col.last((x) => x < 4)).toBe(3);
    });
  });

  describe('filter()', () => {
    it('returns a new Collection with matching items', () => {
      const col = new Collection([1, 2, 3, 4, 5]);
      const result = col.filter((x) => x % 2 === 0);
      expect(result).toBeInstanceOf(Collection);
      expect(result.toArray()).toEqual([2, 4]);
    });
  });

  describe('map()', () => {
    it('maps items to a plain array', () => {
      const col = new Collection([1, 2, 3]);
      const result = col.map((x) => x * 2);
      expect(result).toEqual([2, 4, 6]);
    });
  });

  describe('pluck()', () => {
    it('extracts a property from each item', () => {
      const col = new Collection([
        { name: 'Alice', score: 90 },
        { name: 'Bob', score: 50 },
      ]);
      expect(col.pluck('name')).toEqual(['Alice', 'Bob']);
      expect(col.pluck('score')).toEqual([90, 50]);
    });
  });

  describe('toArray()', () => {
    it('returns a plain JS array copy', () => {
      const items = [1, 2, 3];
      const col = new Collection(items);
      const arr = col.toArray();
      expect(arr).toEqual(items);
      expect(arr).not.toBe(items);
    });
  });

  describe('isEmpty() / isNotEmpty()', () => {
    it('isEmpty returns true for empty collection', () => {
      expect(new Collection().isEmpty()).toBe(true);
      expect(new Collection([1]).isEmpty()).toBe(false);
    });

    it('isNotEmpty returns true for non-empty collection', () => {
      expect(new Collection([1]).isNotEmpty()).toBe(true);
      expect(new Collection().isNotEmpty()).toBe(false);
    });
  });

  describe('length', () => {
    it('length property returns number of items', () => {
      const col = new Collection([1, 2, 3]);
      expect(col.length).toBe(3);
      expect(new Collection().length).toBe(0);
    });
  });

  describe('contains()', () => {
    it('contains(item) checks by strict equality', () => {
      const col = new Collection([1, 2, 3]);
      expect(col.contains(2)).toBe(true);
      expect(col.contains(5)).toBe(false);
    });

    it('contains(predicate) checks any match', () => {
      const col = new Collection([1, 2, 3]);
      expect(col.contains((x) => x > 2)).toBe(true);
      expect(col.contains((x) => x > 10)).toBe(false);
    });
  });

  describe('each()', () => {
    it('iterates all items and returns self', () => {
      const col = new Collection([1, 2, 3]);
      const visited: number[] = [];
      const result = col.each((item) => visited.push(item));
      expect(visited).toEqual([1, 2, 3]);
      expect(result).toBe(col);
    });
  });

  describe('numeric aggregates', () => {
    const items = [{ score: 10 }, { score: 30 }, { score: 20 }];

    it('sum() adds values', () => {
      expect(new Collection(items).sum('score')).toBe(60);
    });

    it('avg() averages values', () => {
      expect(new Collection(items).avg('score')).toBe(20);
    });

    it('avg() returns 0 for empty collection', () => {
      expect(new Collection<{ score: number }>().avg('score')).toBe(0);
    });

    it('min() returns minimum value', () => {
      expect(new Collection(items).min('score')).toBe(10);
    });

    it('max() returns maximum value', () => {
      expect(new Collection(items).max('score')).toBe(30);
    });

    it('min() / max() return undefined for empty collection', () => {
      expect(new Collection<{ score: number }>().min('score')).toBeUndefined();
      expect(new Collection<{ score: number }>().max('score')).toBeUndefined();
    });
  });

  describe('sortBy()', () => {
    it('sorts ascending by key', () => {
      const col = new Collection([{ name: 'Carol' }, { name: 'Alice' }, { name: 'Bob' }]);
      const sorted = col.sortBy('name');
      expect(sorted.pluck('name')).toEqual(['Alice', 'Bob', 'Carol']);
    });

    it('sorts descending when direction is desc', () => {
      const col = new Collection([{ score: 10 }, { score: 30 }, { score: 20 }]);
      const sorted = col.sortBy('score', 'desc');
      expect(sorted.pluck('score')).toEqual([30, 20, 10]);
    });
  });

  describe('groupBy()', () => {
    it('groups items by a key', () => {
      const col = new Collection([
        { name: 'Alice', role: 'admin' },
        { name: 'Bob', role: 'user' },
        { name: 'Carol', role: 'user' },
      ]);
      const groups = col.groupBy('role');
      expect(groups.size).toBe(2);
      expect(groups.get('admin')!.length).toBe(1);
      expect(groups.get('user')!.length).toBe(2);
    });
  });

  describe('keyBy()', () => {
    it('keys items by a unique property', () => {
      const col = new Collection([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ]);
      const map = col.keyBy('id');
      expect(map.get(1)!.name).toBe('Alice');
      expect(map.get(2)!.name).toBe('Bob');
    });
  });

  describe('unique()', () => {
    it('removes duplicate primitive items', () => {
      const col = new Collection([1, 2, 2, 3, 3, 3]);
      expect(col.unique().toArray()).toEqual([1, 2, 3]);
    });

    it('removes duplicates by key', () => {
      const col = new Collection([
        { role: 'admin', name: 'Alice' },
        { role: 'user', name: 'Bob' },
        { role: 'user', name: 'Carol' },
      ]);
      const result = col.unique('role');
      expect(result.length).toBe(2);
      expect(result.pluck('role')).toEqual(['admin', 'user']);
    });
  });

  describe('chunk()', () => {
    it('splits into sub-collections of given size', () => {
      const col = new Collection([1, 2, 3, 4, 5]);
      const chunks = col.chunk(2);
      expect(chunks.length).toBe(3);
      expect(chunks[0].toArray()).toEqual([1, 2]);
      expect(chunks[1].toArray()).toEqual([3, 4]);
      expect(chunks[2].toArray()).toEqual([5]);
    });
  });

  describe('toString() / toJSON()', () => {
    it('toString() returns JSON string', () => {
      const col = new Collection([1, 2, 3]);
      expect(col.toString()).toBe('[1,2,3]');
    });

    it('toJSON() returns the underlying array', () => {
      const col = new Collection([{ a: 1 }]);
      expect(col.toJSON()).toEqual([{ a: 1 }]);
    });
  });

  describe('reject()', () => {
    it('returns items NOT matching predicate', () => {
      const col = new Collection([1, 2, 3, 4]);
      expect(col.reject((x) => x % 2 === 0).toArray()).toEqual([1, 3]);
    });
  });

  describe('some() / every()', () => {
    it('some() returns true if any item matches', () => {
      const col = new Collection([1, 2, 3]);
      expect(col.some((x) => x === 2)).toBe(true);
      expect(col.some((x) => x > 10)).toBe(false);
    });

    it('every() returns true if all items match', () => {
      const col = new Collection([2, 4, 6]);
      expect(col.every((x) => x % 2 === 0)).toBe(true);
      expect(col.every((x) => x > 3)).toBe(false);
    });
  });

  describe('flatMap()', () => {
    it('maps and flattens one level', () => {
      const col = new Collection([1, 2, 3]);
      expect(col.flatMap((x) => [x, x * 10])).toEqual([1, 10, 2, 20, 3, 30]);
    });
  });

  describe('reduce()', () => {
    it('reduces to a single value', () => {
      const col = new Collection([1, 2, 3, 4]);
      expect(col.reduce((acc, x) => acc + x, 0)).toBe(10);
    });
  });

  describe('take() / takeLast() / skip()', () => {
    it('take() returns first n items', () => {
      expect(new Collection([1, 2, 3, 4]).take(2).toArray()).toEqual([1, 2]);
    });

    it('takeLast() returns last n items', () => {
      expect(new Collection([1, 2, 3, 4]).takeLast(2).toArray()).toEqual([3, 4]);
    });

    it('skip() skips first n items', () => {
      expect(new Collection([1, 2, 3, 4]).skip(2).toArray()).toEqual([3, 4]);
    });
  });

  describe('merge()', () => {
    it('merges with another Collection', () => {
      const a = new Collection([1, 2]);
      const b = new Collection([3, 4]);
      expect(a.merge(b).toArray()).toEqual([1, 2, 3, 4]);
    });

    it('merges with a plain array', () => {
      const a = new Collection([1, 2]);
      expect(a.merge([3, 4]).toArray()).toEqual([1, 2, 3, 4]);
    });
  });

  describe('[Symbol.iterator]', () => {
    it('is iterable via for...of', () => {
      const col = new Collection([10, 20, 30]);
      const result: number[] = [];
      for (const item of col) result.push(item);
      expect(result).toEqual([10, 20, 30]);
    });
  });

  describe('get()', () => {
    it('returns item at index', () => {
      const col = new Collection(['a', 'b', 'c']);
      expect(col.get(1)).toBe('b');
      expect(col.get(99)).toBeUndefined();
    });
  });
});

// ── ModelCollection<T> tests ──────────────────────────────────────────────

describe('ModelCollection<ColUser>', () => {
  describe('findByKey()', () => {
    it('returns model with matching primary key', async () => {
      const { alice } = await seedUsers();
      const mc = (await ColUser.all()) as ModelCollection<ColUser>;
      const found = mc.findByKey(alice._attributes.id);
      expect(found).toBeDefined();
      expect((found as ColUser)._attributes.name).toBe('Alice');
    });

    it('returns undefined for non-existent key', async () => {
      await seedUsers();
      const mc = (await ColUser.all()) as ModelCollection<ColUser>;
      expect(mc.findByKey(99999)).toBeUndefined();
    });
  });

  describe('findOrFail()', () => {
    it('returns model when found', async () => {
      const { bob } = await seedUsers();
      const mc = (await ColUser.all()) as ModelCollection<ColUser>;
      const found = mc.findOrFail(bob._attributes.id);
      expect((found as ColUser)._attributes.name).toBe('Bob');
    });

    it('throws when model not found', async () => {
      await seedUsers();
      const mc = (await ColUser.all()) as ModelCollection<ColUser>;
      expect(() => mc.findOrFail(99999)).toThrow(
        '[orion] Model with primary key "99999" not found in collection.'
      );
    });
  });

  describe('modelKeys()', () => {
    it('returns array of primary key values', async () => {
      const { alice, bob, carol } = await seedUsers();
      const mc = (await ColUser.all()) as ModelCollection<ColUser>;
      const keys = mc.modelKeys();
      expect(keys).toContain(alice._attributes.id);
      expect(keys).toContain(bob._attributes.id);
      expect(keys).toContain(carol._attributes.id);
      expect(keys.length).toBe(3);
    });
  });

  describe('except()', () => {
    it('returns collection without specified ids', async () => {
      const { alice } = await seedUsers();
      const mc = (await ColUser.all()) as ModelCollection<ColUser>;
      const result = mc.except([alice._attributes.id]);
      expect(result.length).toBe(2);
      expect(result.findByKey(alice._attributes.id)).toBeUndefined();
    });
  });

  describe('only()', () => {
    it('returns collection with only specified ids', async () => {
      const { alice, bob } = await seedUsers();
      const mc = (await ColUser.all()) as ModelCollection<ColUser>;
      const result = mc.only([alice._attributes.id, bob._attributes.id]);
      expect(result.length).toBe(2);
      const names = result.map((u) => (u as ColUser)._attributes.name);
      expect(names).toContain('Alice');
      expect(names).toContain('Bob');
    });
  });

  describe('diff()', () => {
    it('returns models in mc but not in other', async () => {
      const { alice, bob } = await seedUsers();
      const mc = (await ColUser.all()) as ModelCollection<ColUser>;
      const other = mc.only([alice._attributes.id]) as ModelCollection<ColUser>;
      const result = mc.diff(other);
      expect(result.length).toBe(2);
      expect(result.findByKey(alice._attributes.id)).toBeUndefined();
      expect(result.findByKey(bob._attributes.id)).toBeDefined();
    });
  });

  describe('intersect()', () => {
    it('returns models in both collections', async () => {
      const { alice, bob } = await seedUsers();
      const mc = (await ColUser.all()) as ModelCollection<ColUser>;
      const other = mc.only([alice._attributes.id, bob._attributes.id]) as ModelCollection<ColUser>;
      const result = mc.intersect(other);
      expect(result.length).toBe(2);
      expect(result.findByKey(alice._attributes.id)).toBeDefined();
      expect(result.findByKey(bob._attributes.id)).toBeDefined();
    });
  });

  describe('toQuery()', () => {
    it('returns a ModelBuilder constrained to collection PKs', async () => {
      const { alice, bob } = await seedUsers();
      const mc = (await ColUser.all()) as ModelCollection<ColUser>;
      const subset = mc.only([alice._attributes.id, bob._attributes.id]) as ModelCollection<ColUser>;
      const qb = subset.toQuery();
      const results = (await qb.get()) as ModelCollection<ColUser>;
      expect(results.length).toBe(2);
    });
  });

  describe('fresh()', () => {
    it('re-fetches models from DB', async () => {
      await seedUsers();
      const mc = (await ColUser.all()) as ModelCollection<ColUser>;
      const fresh = await mc.fresh();
      expect(fresh.length).toBe(mc.length);
      expect(fresh).toBeInstanceOf(ModelCollection);
    });

    it('returns empty ModelCollection when collection is empty', async () => {
      const mc = new ModelCollection<ColUser>([], ColUser as any);
      const fresh = await mc.fresh();
      expect(fresh.length).toBe(0);
    });
  });

  describe('makeVisible() / makeHidden()', () => {
    it('makeVisible delegates to each model and returns this', async () => {
      await seedUsers();
      const mc = (await ColUser.all()) as ModelCollection<ColUser>;
      const result = mc.makeVisible(['name']);
      expect(result).toBe(mc);
    });

    it('makeHidden delegates to each model and returns this', async () => {
      await seedUsers();
      const mc = (await ColUser.all()) as ModelCollection<ColUser>;
      const result = mc.makeHidden(['name']);
      expect(result).toBe(mc);
    });
  });

  describe('contains() (ModelCollection override)', () => {
    it('returns true when collection contains model by instance', async () => {
      const { alice } = await seedUsers();
      const mc = (await ColUser.all()) as ModelCollection<ColUser>;
      const aliceFromMc = mc.findByKey(alice._attributes.id)!;
      expect(mc.contains(aliceFromMc)).toBe(true);
    });

    it('returns true when collection contains model by PK value', async () => {
      const { alice } = await seedUsers();
      const mc = (await ColUser.all()) as ModelCollection<ColUser>;
      expect(mc.contains(alice._attributes.id)).toBe(true);
    });

    it('returns false for unknown PK', async () => {
      await seedUsers();
      const mc = (await ColUser.all()) as ModelCollection<ColUser>;
      expect(mc.contains(99999)).toBe(false);
    });
  });

  describe('unique() (ModelCollection override)', () => {
    it('deduplicates by primary key', async () => {
      const { alice } = await seedUsers();
      const mc = (await ColUser.all()) as ModelCollection<ColUser>;
      const aliceModel = mc.findByKey(alice._attributes.id)! as ColUser;
      const withDuplicates = new ModelCollection<ColUser>(
        [...mc.toArray(), aliceModel],
        ColUser as any
      );
      expect(withDuplicates.length).toBe(4);
      const deduped = withDuplicates.unique();
      expect(deduped.length).toBe(3);
    });
  });

  describe('partition()', () => {
    it('splits collection into [matching, nonMatching]', async () => {
      await seedUsers();
      const mc = (await ColUser.all()) as ModelCollection<ColUser>;
      const [admins, others] = mc.partition(
        (u) => (u as ColUser)._attributes.role === 'admin'
      );
      expect(admins.length).toBe(1);
      expect(others.length).toBe(2);
    });
  });

  describe('setVisible() / setHidden()', () => {
    it('setVisible delegates to each model and returns this', async () => {
      await seedUsers();
      const mc = (await ColUser.all()) as ModelCollection<ColUser>;
      expect(mc.setVisible(['name'])).toBe(mc);
    });

    it('setHidden delegates to each model and returns this', async () => {
      await seedUsers();
      const mc = (await ColUser.all()) as ModelCollection<ColUser>;
      expect(mc.setHidden(['score'])).toBe(mc);
    });
  });

  describe('load() / loadMissing()', () => {
    it('load() returns this for empty relations array', async () => {
      await seedUsers();
      const mc = (await ColUser.all()) as ModelCollection<ColUser>;
      const result = await mc.load([]);
      expect(result).toBe(mc);
    });

    it('loadMissing() returns this for empty relations array', async () => {
      await seedUsers();
      const mc = (await ColUser.all()) as ModelCollection<ColUser>;
      const result = await mc.loadMissing([]);
      expect(result).toBe(mc);
    });
  });

  describe('empty ModelCollection edge cases', () => {
    it('modelKeys() returns empty array', () => {
      const mc = new ModelCollection<ColUser>([], ColUser as any);
      expect(mc.modelKeys()).toEqual([]);
    });

    it('except() and only() on empty collection return empty', () => {
      const mc = new ModelCollection<ColUser>([], ColUser as any);
      expect(mc.except([1]).length).toBe(0);
      expect(mc.only([1]).length).toBe(0);
    });

    it('diff() keeps all when other is empty', async () => {
      await seedUsers();
      const mc = (await ColUser.all()) as ModelCollection<ColUser>;
      const empty = new ModelCollection<ColUser>([], ColUser as any);
      expect(mc.diff(empty).length).toBe(3);
    });

    it('intersect() returns empty when other is empty', async () => {
      await seedUsers();
      const mc = (await ColUser.all()) as ModelCollection<ColUser>;
      const empty = new ModelCollection<ColUser>([], ColUser as any);
      expect(mc.intersect(empty).length).toBe(0);
    });
  });
});
