import { ConnectionManager } from '../../src/connection/ConnectionManager';
import { Schema } from '../../src/schema/Schema';
import { SQLiteSchemaGrammar } from '../../src/schema/grammars/SQLiteSchemaGrammar';
import { Model } from '../../src/model/Model';
import { ModelBuilder } from '../../src/model/ModelBuilder';
import { table } from '../../src/model/decorators/table';
import { fillable } from '../../src/model/decorators/fillable';
import { scopedBy, scope } from '../../src/model/decorators/scope';
import { GlobalScope } from '../../src/model/ModelMetadata';

// ── Global scope ──────────────────────────────────────────────────────────

class ActiveScope implements GlobalScope {
  apply(builder: ModelBuilder<any>, _model: Function): void {
    builder.where('active', 1);
  }
}

// ── Model definitions ─────────────────────────────────────────────────────

@table({ name: 'scoped_items', timestamps: false, connection: 'scopes' })
@fillable(['name', 'active', 'type'])
@scopedBy([ActiveScope])
class ScopedItem extends Model {
  declare name: string;
  declare active: number;
  declare type: string;

  @scope
  ofType(builder: ModelBuilder<ScopedItem>, type: string): void {
    builder.where('type', type);
  }
}

@table({ name: 'plain_items', timestamps: false, connection: 'scopes' })
@fillable(['name', 'active'])
class PlainItem extends Model {
  declare name: string;
  declare active: number;
}

// ── Setup ─────────────────────────────────────────────────────────────────

beforeAll(async () => {
  ConnectionManager.addConnection('scopes', {
    driver: 'sqlite',
    filename: ':memory:',
  });
  Schema.useGrammar(new SQLiteSchemaGrammar());

  const conn = 'scopes';

  await Schema.create('scoped_items', (t) => {
    t.id();
    t.string('name');
    t.integer('active').default(1);
    t.string('type').nullable();
  }, conn);

  await Schema.create('plain_items', (t) => {
    t.id();
    t.string('name');
    t.integer('active').default(1);
  }, conn);
});

afterAll(async () => {
  await ConnectionManager.disconnectAll();
});

beforeEach(async () => {
  const db = ConnectionManager.getConnection('scopes');
  await db.query('DELETE FROM scoped_items');
  await db.query('DELETE FROM plain_items');
});

// ── Tests ─────────────────────────────────────────────────────────────────

describe('global scope', () => {
  it('is applied automatically to all queries', async () => {
    const db = ConnectionManager.getConnection('scopes');
    await db.query('INSERT INTO scoped_items (name, active) VALUES (?, ?)', ['Active1', 1]);
    await db.query('INSERT INTO scoped_items (name, active) VALUES (?, ?)', ['Active2', 1]);
    await db.query('INSERT INTO scoped_items (name, active) VALUES (?, ?)', ['Inactive', 0]);

    const all = await ScopedItem.all();
    expect(all.length).toBe(2);
    for (const item of all) {
      expect(item._attributes.active).toBe(1);
    }
  });
});

describe('withoutGlobalScope', () => {
  it('removes the scope for that query only', async () => {
    const db = ConnectionManager.getConnection('scopes');
    await db.query('INSERT INTO scoped_items (name, active) VALUES (?, ?)', ['Active', 1]);
    await db.query('INSERT INTO scoped_items (name, active) VALUES (?, ?)', ['Inactive', 0]);

    const all = await ScopedItem.withoutGlobalScope('ActiveScope').get();
    expect(all.length).toBe(2);
  });
});

describe('local scope via @scope', () => {
  it('filters correctly via the scope method', async () => {
    const db = ConnectionManager.getConnection('scopes');
    await db.query("INSERT INTO scoped_items (name, active, type) VALUES (?, ?, ?)", ['Widget', 1, 'widget']);
    await db.query("INSERT INTO scoped_items (name, active, type) VALUES (?, ?, ?)", ['Gadget', 1, 'gadget']);
    await db.query("INSERT INTO scoped_items (name, active, type) VALUES (?, ?, ?)", ['Widget2', 1, 'widget']);

    const results = await (ScopedItem.query() as any).ofType('widget').get();
    expect(results.length).toBe(2);
    for (const r of results) {
      expect(r._attributes.type).toBe('widget');
    }
  });
});

describe('where(...).orWhere(...) chaining', () => {
  it('returns union of both conditions', async () => {
    await PlainItem.create({ name: 'A', active: 1 });
    await PlainItem.create({ name: 'B', active: 0 });
    await PlainItem.create({ name: 'C', active: 1 });
    await PlainItem.create({ name: 'D', active: 0 });

    const results = await PlainItem.where('active', 1).orWhere('name', 'B').get();
    const names = results.map((r) => r._attributes.name as string).sort();
    expect(names).toContain('A');
    expect(names).toContain('B');
    expect(names).toContain('C');
    expect(names).not.toContain('D');
  });
});
