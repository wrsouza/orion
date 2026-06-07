/**
 * Tests for model concerns and resource decorators.
 *
 * Covers:
 *  - HasUuids mixin
 *  - HasUlids mixin
 *  - Prunable mixin
 *  - MassPrunable mixin
 *  - resource decorators (UseResource / UseResourceCollection)
 */
import { ConnectionManager } from '../../src/connection/ConnectionManager';
import { Schema } from '../../src/schema/Schema';
import { SQLiteSchemaGrammar } from '../../src/schema/grammars/SQLiteSchemaGrammar';
import { Model } from '../../src/model/Model';
import { ModelMetadata } from '../../src/model/ModelMetadata';
import { table } from '../../src/model/decorators/table';
import { fillable } from '../../src/model/decorators/fillable';
import { HasUuids } from '../../src/model/concerns/HasUuids';
import { HasUlids } from '../../src/model/concerns/HasUlids';
import { Prunable } from '../../src/model/concerns/Prunable';
import { MassPrunable } from '../../src/model/concerns/MassPrunable';
import { UseResource, UseResourceCollection } from '../../src/model/decorators/resource';

// ── Model definitions ─────────────────────────────────────────────────────

@table({ name: 'uuid_items', timestamps: false, connection: 'concerns', incrementing: false, keyType: 'string' })
@fillable(['name', 'id'])
class UuidItem extends HasUuids(Model) {
  declare id: string;
  declare name: string;
}

@table({ name: 'ulid_items', timestamps: false, connection: 'concerns', incrementing: false, keyType: 'string' })
@fillable(['name', 'id'])
class UlidItem extends HasUlids(Model) {
  declare id: string;
  declare name: string;
}

@table({ name: 'prunable_items', timestamps: false, connection: 'concerns' })
@fillable(['name'])
class PrunableItem extends Prunable(Model) {
  declare name: string;

  prunable() {
    return (this.constructor as typeof PrunableItem).query().where('name', 'old');
  }
}

@table({ name: 'mass_prunable_items', timestamps: false, connection: 'concerns' })
@fillable(['name'])
class MassPrunableItem extends MassPrunable(Model) {
  declare name: string;

  prunable() {
    return (this.constructor as typeof MassPrunableItem).query().where('name', 'stale');
  }
}

// ── Resource stub classes ─────────────────────────────────────────────────

class FakeResource {
  constructor(public model: any) {}
  toArray() {
    return {};
  }
}

class FakeResourceCollection {
  constructor(
    public items: any[],
    public resourceClass?: any
  ) {}
}

// ── Models for resource decorator tests ──────────────────────────────────

@UseResource(FakeResource)
@table({ name: 'resource_models', timestamps: false })
class ResourceModel extends Model {}

@UseResourceCollection(FakeResourceCollection)
@table({ name: 'collection_models', timestamps: false })
class CollectionModel extends Model {}

// ── Setup / teardown ──────────────────────────────────────────────────────

beforeAll(async () => {
  ConnectionManager.addConnection('concerns', {
    driver: 'sqlite',
    filename: ':memory:',
  });
  Schema.useGrammar(new SQLiteSchemaGrammar());

  const conn = ConnectionManager.getConnection('concerns');

  // uuid_items — TEXT primary key, not auto-increment
  await conn.query(`CREATE TABLE uuid_items (id TEXT PRIMARY KEY, name TEXT)`);

  // ulid_items — TEXT primary key, not auto-increment
  await conn.query(`CREATE TABLE ulid_items (id TEXT PRIMARY KEY, name TEXT)`);

  // prunable_items
  await conn.query(
    `CREATE TABLE prunable_items (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)`
  );

  // mass_prunable_items
  await conn.query(
    `CREATE TABLE mass_prunable_items (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)`
  );
});

afterAll(async () => {
  await ConnectionManager.disconnectAll();
});

// Clear tables between tests to avoid ordering issues
beforeEach(async () => {
  await (UuidItem as any).query().delete();
  await (UlidItem as any).query().delete();
  await (PrunableItem as any).query().delete();
  await (MassPrunableItem as any).query().delete();
});

// ── HasUuids ─────────────────────────────────────────────────────────────

describe('HasUuids mixin', () => {
  it('auto-generates a UUID v4 as the primary key on create', async () => {
    const item = await UuidItem.create({ name: 'alpha' });
    const id = item._attributes.id as string;
    expect(typeof id).toBe('string');
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it('generates distinct UUIDs for each record', async () => {
    const a = await UuidItem.create({ name: 'a' });
    const b = await UuidItem.create({ name: 'b' });
    expect(a._attributes.id).not.toBe(b._attributes.id);
  });

  it('does NOT overwrite an explicitly supplied id', async () => {
    const supplied = '11111111-1111-4111-a111-111111111111';
    const item = await UuidItem.create({ name: 'explicit', id: supplied });
    expect(item._attributes.id).toBe(supplied);
  });

  it('newUniqueId() returns a valid UUID v4', () => {
    const instance = new (HasUuids(Model) as any)();
    const id = instance.newUniqueId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it('uniqueIds() returns the primary key column name', () => {
    const instance = new UuidItem() as any;
    const cfg = ModelMetadata.resolve(instance);
    expect(instance.uniqueIds()).toEqual([cfg.primaryKey]);
  });

  it('_applyUniqueIds() populates the id attribute', () => {
    const instance = new UuidItem() as any;
    instance._attributes = {};
    instance._applyUniqueIds();
    expect(instance._attributes.id).toBeDefined();
    expect(instance._attributes.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it('_applyUniqueIds() does NOT overwrite an already-set id', () => {
    const instance = new UuidItem() as any;
    const preset = '22222222-2222-4222-a222-222222222222';
    instance._attributes = { id: preset };
    instance._applyUniqueIds();
    expect(instance._attributes.id).toBe(preset);
  });
});

// ── HasUlids ─────────────────────────────────────────────────────────────

describe('HasUlids mixin', () => {
  it('auto-generates a ULID as the primary key on create', async () => {
    const item = await UlidItem.create({ name: 'alpha' });
    const id = item._attributes.id as string;
    expect(typeof id).toBe('string');
    expect(id).toMatch(/^[0-9A-Z]{26}$/);
  });

  it('generates distinct ULIDs for each record', async () => {
    const a = await UlidItem.create({ name: 'a' });
    const b = await UlidItem.create({ name: 'b' });
    expect(a._attributes.id).not.toBe(b._attributes.id);
  });

  it('does NOT overwrite an explicitly supplied id', async () => {
    const supplied = '01HZQG7K4X3M2N8P5R6T7V9WCB';
    const item = await UlidItem.create({ name: 'explicit', id: supplied });
    expect(item._attributes.id).toBe(supplied);
  });

  it('newUniqueId() returns a 26-character Crockford base-32 string', () => {
    const instance = new (HasUlids(Model) as any)();
    const id = instance.newUniqueId();
    expect(id).toMatch(/^[0-9A-Z]{26}$/);
  });

  it('uniqueIds() returns the primary key column name', () => {
    const instance = new UlidItem() as any;
    const cfg = ModelMetadata.resolve(instance);
    expect(instance.uniqueIds()).toEqual([cfg.primaryKey]);
  });

  it('_applyUniqueIds() populates the id attribute', () => {
    const instance = new UlidItem() as any;
    instance._attributes = {};
    instance._applyUniqueIds();
    expect(instance._attributes.id).toBeDefined();
    expect(instance._attributes.id).toMatch(/^[0-9A-Z]{26}$/);
  });

  it('_applyUniqueIds() does NOT overwrite a preset id', () => {
    const instance = new UlidItem() as any;
    const preset = '01HZQG7K4X3M2N8P5R6T7V9WCB';
    instance._attributes = { id: preset };
    instance._applyUniqueIds();
    expect(instance._attributes.id).toBe(preset);
  });

  it('ULIDs encode the current timestamp in the first 10 characters', () => {
    // The time component (first 10 chars) encodes Date.now() in Crockford base-32.
    // Two ULIDs generated at least 1 ms apart must have non-decreasing prefixes.
    const instance = new (HasUlids(Model) as any)();
    const before = instance.newUniqueId().slice(0, 10);
    const after = instance.newUniqueId().slice(0, 10);
    expect(after >= before).toBe(true);
  });
});

// ── Prunable ─────────────────────────────────────────────────────────────

describe('Prunable mixin', () => {
  it('pruneAll() deletes records matching prunable() and returns count', async () => {
    await PrunableItem.create({ name: 'old' });
    await PrunableItem.create({ name: 'old' });
    await PrunableItem.create({ name: 'keep' });

    const pruned = await (PrunableItem as any).pruneAll(100);
    expect(pruned).toBe(2);

    const remaining = await PrunableItem.query().get();
    expect(remaining.length).toBe(1);
    expect((remaining.first() as any)._attributes.name).toBe('keep');
  });

  it('pruneAll() returns 0 when nothing matches', async () => {
    await PrunableItem.create({ name: 'keep' });
    const pruned = await (PrunableItem as any).pruneAll();
    expect(pruned).toBe(0);
  });

  it('pruneAll() deletes all matching records leaving none', async () => {
    await PrunableItem.create({ name: 'old' });
    await (PrunableItem as any).pruneAll();
    const remaining = await PrunableItem.query().get();
    expect(remaining.length).toBe(0);
  });

  it('base prunable() throws when not overridden', () => {
    const RawPrunable = Prunable(Model) as any;
    const instance = new RawPrunable();
    expect(() => instance.prunable()).toThrow(/must implement prunable/);
  });

  it('pruning() hook exists and does not throw', async () => {
    const item = await PrunableItem.create({ name: 'old' });
    // pruning() returns void (not a Promise), just ensure it does not throw
    expect(() => (item as any).pruning()).not.toThrow();
  });
});

// ── MassPrunable ──────────────────────────────────────────────────────────

describe('MassPrunable mixin', () => {
  it('pruneAll() bulk-deletes records matching prunable() and returns count', async () => {
    await MassPrunableItem.create({ name: 'stale' });
    await MassPrunableItem.create({ name: 'stale' });
    await MassPrunableItem.create({ name: 'fresh' });

    const deleted = await (MassPrunableItem as any).pruneAll();
    expect(deleted).toBe(2);

    const remaining = await MassPrunableItem.query().get();
    expect(remaining.length).toBe(1);
    expect((remaining.first() as any)._attributes.name).toBe('fresh');
  });

  it('pruneAll() returns 0 when nothing matches', async () => {
    await MassPrunableItem.create({ name: 'fresh' });
    const deleted = await (MassPrunableItem as any).pruneAll();
    expect(deleted).toBe(0);
  });

  it('base prunable() throws when not overridden', () => {
    const RawMassPrunable = MassPrunable(Model) as any;
    const instance = new RawMassPrunable();
    expect(() => instance.prunable()).toThrow(/must implement prunable/);
  });

  it('pruneAll() with all matching records leaves table empty', async () => {
    await MassPrunableItem.create({ name: 'stale' });
    await MassPrunableItem.create({ name: 'stale' });
    await (MassPrunableItem as any).pruneAll();
    const remaining = await MassPrunableItem.query().get();
    expect(remaining.length).toBe(0);
  });
});

// ── resource decorators ───────────────────────────────────────────────────

describe('UseResource decorator', () => {
  it('stores the resource class in ModelMetadata.resourceClass', () => {
    const meta = ModelMetadata.get(ResourceModel);
    expect(meta.resourceClass).toBe(FakeResource);
  });

  it('does not set resourceClass on a different model', () => {
    const meta = ModelMetadata.get(CollectionModel);
    expect(meta.resourceClass).toBeNull();
  });

  it('un-decorated models have resourceClass as null by default', () => {
    @table({ name: 'plain_models', timestamps: false })
    class PlainModel extends Model {}
    const meta = ModelMetadata.get(PlainModel);
    expect(meta.resourceClass).toBeNull();
  });
});

describe('UseResourceCollection decorator', () => {
  it('stores the collection class in ModelMetadata.resourceCollectionClass', () => {
    const meta = ModelMetadata.get(CollectionModel);
    expect(meta.resourceCollectionClass).toBe(FakeResourceCollection);
  });

  it('does not affect other models resourceCollectionClass', () => {
    const meta = ModelMetadata.get(ResourceModel);
    expect(meta.resourceCollectionClass).toBeNull();
  });
});

describe('UseResource and UseResourceCollection combined', () => {
  it('can set both on the same model class', () => {
    @UseResourceCollection(FakeResourceCollection)
    @UseResource(FakeResource)
    @table({ name: 'both_models', timestamps: false })
    class BothModel extends Model {}

    const meta = ModelMetadata.get(BothModel);
    expect(meta.resourceClass).toBe(FakeResource);
    expect(meta.resourceCollectionClass).toBe(FakeResourceCollection);
  });
});
