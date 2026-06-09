import { ConnectionManager } from '../../src/connection/ConnectionManager';
import { Schema } from '../../src/schema/Schema';
import { SQLiteSchemaGrammar } from '../../src/schema/grammars/SQLiteSchemaGrammar';
import { Model } from '../../src/model/Model';
import { table } from '../../src/model/decorators/table';
import { fillable } from '../../src/model/decorators/fillable';
import { map } from '../../src/model/decorators/map';

// ── Model definition ──────────────────────────────────────────────────────

@table({ name: 'items', timestamps: false, connection: 'crud' })
@fillable(['name', 'qty', 'email'])
class Item extends Model {
  declare name: string;
  declare qty: number;
  declare email: string;
}

@table({ name: 'mapped_items', timestamps: false, connection: 'crud' })
class MappedItem extends Model {
  declare name: string;

  @map('some_value')
  declare someValue: number;
}

// ── Setup ─────────────────────────────────────────────────────────────────

beforeAll(async () => {
  ConnectionManager.addConnection('crud', {
    driver: 'sqlite',
    filename: ':memory:',
  });
  Schema.useGrammar(new SQLiteSchemaGrammar());

  await Schema.create('items', (t) => {
    t.id();
    t.string('name').unique();
    t.integer('qty').default(0);
    t.string('email').nullable();
  }, 'crud');

  await Schema.create('mapped_items', (t) => {
    t.id();
    t.string('name');
    t.integer('some_value').default(0);
  }, 'crud');
});

afterAll(async () => {
  await ConnectionManager.disconnectAll();
});

beforeEach(async () => {
  await Item.query().delete();
});

// ── Tests ─────────────────────────────────────────────────────────────────

describe('Model.create', () => {
  it('inserts a row and returns an instance with an id', async () => {
    const item = await Item.create({ name: 'Alpha', qty: 5 });
    expect(item).toBeInstanceOf(Item);
    expect(item._attributes.id).toBeDefined();
    expect(item._attributes.name).toBe('Alpha');
    expect(item.wasRecentlyCreated).toBe(true);
  });
});

describe('Model.find', () => {
  it('returns the correct instance by primary key', async () => {
    const created = await Item.create({ name: 'Beta', qty: 3 });
    const found = await Item.find(created._attributes.id);
    expect(found).not.toBeNull();
    expect(found!._attributes.name).toBe('Beta');
  });

  it('returns null when not found', async () => {
    const found = await Item.find(99999);
    expect(found).toBeNull();
  });
});

describe('Model.findOrFail', () => {
  it('returns the instance when it exists', async () => {
    const created = await Item.create({ name: 'Gamma' });
    const found = await Item.findOrFail(created._attributes.id);
    expect(found._attributes.name).toBe('Gamma');
  });

  it('throws when not found', async () => {
    await expect(Item.findOrFail(99999)).rejects.toThrow();
  });
});

describe('instance.update', () => {
  it('updates and persists the changed attributes', async () => {
    const item = await Item.create({ name: 'Delta', qty: 1 });
    await item.update({ qty: 99 });

    const fresh = await Item.find(item._attributes.id);
    expect(fresh!._attributes.qty).toBe(99);
  });
});

describe('instance.delete', () => {
  it('removes the row from the database', async () => {
    const item = await Item.create({ name: 'ToDelete' });
    const id = item._attributes.id;
    await item.delete();

    const found = await Item.find(id);
    expect(found).toBeNull();
    expect(item.exists).toBe(false);
  });
});

describe('Model.all', () => {
  it('returns all rows as a collection', async () => {
    await Item.create({ name: 'A' });
    await Item.create({ name: 'B' });
    await Item.create({ name: 'C' });

    const all = await Item.all();
    expect(all.length).toBe(3);
  });
});

describe('Model.where', () => {
  it('filters rows correctly by column value', async () => {
    await Item.create({ name: 'X', qty: 10 });
    await Item.create({ name: 'Y', qty: 20 });
    await Item.create({ name: 'Z', qty: 10 });

    const results = await Item.where('qty', 10).get();
    expect(results.length).toBe(2);
    for (const r of results) {
      expect(r._attributes.qty).toBe(10);
    }
  });

  it('supports orWhere chaining', async () => {
    await Item.create({ name: 'P', qty: 1 });
    await Item.create({ name: 'Q', qty: 2 });
    await Item.create({ name: 'R', qty: 3 });

    const results = await Item.where('qty', 1).orWhere('qty', 3).get();
    expect(results.length).toBe(2);
  });
});

describe('Model.upsert', () => {
  it('inserts new rows and updates existing ones', async () => {
    await Item.create({ name: 'Upsert', qty: 1 });

    await Item.query().upsert(
      [
        { name: 'Upsert', qty: 99 },
        { name: 'NewUpsert', qty: 5 },
      ],
      ['name'],
      ['qty']
    );

    const updated = await Item.where('name', 'Upsert').first();
    expect(updated!._attributes.qty).toBe(99);

    const inserted = await Item.where('name', 'NewUpsert').first();
    expect(inserted).not.toBeNull();
    expect(inserted!._attributes.qty).toBe(5);
  });
});

describe('Model.firstOrCreate', () => {
  it('returns existing row without inserting', async () => {
    await Item.create({ name: 'Existing', qty: 7 });

    const item = await Item.firstOrCreate({ name: 'Existing' }, { qty: 999 });
    expect(item._attributes.qty).toBe(7);

    const count = await Item.where('name', 'Existing').count();
    expect(count).toBe(1);
  });

  it('creates a new row when not found', async () => {
    const item = await Item.firstOrCreate({ name: 'Created' }, { qty: 42 });
    expect(item.wasRecentlyCreated).toBe(true);
    expect(item._attributes.qty).toBe(42);
  });
});

describe('@map decorator with Model.create', () => {
  it('translates camelCase property names to snake_case column names on insert', async () => {
    const item = await MappedItem.create({ name: 'Mapped', someValue: 42 });
    expect(item._attributes['some_value']).toBe(42);

    const found = await MappedItem.find(item._attributes.id);
    expect(found).not.toBeNull();
    expect(found!.someValue).toBe(42);
  });
});

describe('Model.updateOrCreate', () => {
  it('updates an existing row', async () => {
    await Item.create({ name: 'ToUpdate', qty: 1 });

    const item = await Item.updateOrCreate({ name: 'ToUpdate' }, { qty: 55 });
    expect(item._attributes.qty).toBe(55);
  });

  it('creates a new row when not found', async () => {
    const item = await Item.updateOrCreate({ name: 'NewCreate' }, { qty: 77 });
    expect(item.wasRecentlyCreated).toBe(true);
    expect(item._attributes.qty).toBe(77);
  });
});
