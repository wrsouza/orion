import { ConnectionManager } from '../../src/connection/ConnectionManager';
import { Schema } from '../../src/schema/Schema';
import { SQLiteSchemaGrammar } from '../../src/schema/grammars/SQLiteSchemaGrammar';
import { Model } from '../../src/model/Model';
import { SoftDeletes } from '../../src/model/concerns/SoftDeletes';
import { table } from '../../src/model/decorators/table';
import { fillable } from '../../src/model/decorators/fillable';

// ── Model definition ──────────────────────────────────────────────────────

@table({ name: 'soft_items', timestamps: false, connection: 'softdelete' })
@fillable(['name'])
class SoftItem extends SoftDeletes(Model) {
  declare name: string;
  declare deleted_at: Date | null;
}

// ── Setup ─────────────────────────────────────────────────────────────────

beforeAll(async () => {
  ConnectionManager.addConnection('softdelete', {
    driver: 'sqlite',
    filename: ':memory:',
  });
  Schema.useGrammar(new SQLiteSchemaGrammar());

  await Schema.create('soft_items', (t) => {
    t.id();
    t.string('name');
    t.timestamp('deleted_at').nullable();
  }, 'softdelete');
});

afterAll(async () => {
  await ConnectionManager.disconnectAll();
});

beforeEach(async () => {
  await ConnectionManager.getConnection('softdelete').query('DELETE FROM soft_items');
});

// ── Tests ─────────────────────────────────────────────────────────────────

describe('soft delete: model.delete()', () => {
  it('sets deleted_at and does NOT remove the row from the table', async () => {
    const item = await SoftItem.create({ name: 'Deletable' });
    const id = item._attributes.id;

    await item.delete();

    const rows = await ConnectionManager.getConnection('softdelete').query(
      'SELECT * FROM soft_items WHERE id = ?',
      [id]
    );
    expect(rows.rows.length).toBe(1);
    expect(rows.rows[0].deleted_at).not.toBeNull();
  });

  it('item.trashed() returns true after soft delete', async () => {
    const item = await SoftItem.create({ name: 'ToTrash' });
    await item.delete();
    expect((item as any).trashed()).toBe(true);
  });
});

describe('Model.all() excludes soft-deleted rows', () => {
  it('does not return soft-deleted rows by default', async () => {
    await SoftItem.create({ name: 'Live' });
    const toDelete = await SoftItem.create({ name: 'Dead' });
    await toDelete.delete();

    const all = await SoftItem.all();
    expect(all.length).toBe(1);
    expect(all.first()!._attributes.name).toBe('Live');
  });
});

describe('Model.withTrashed()', () => {
  it('includes soft-deleted rows', async () => {
    await SoftItem.create({ name: 'Alive' });
    const dead = await SoftItem.create({ name: 'Gone' });
    await dead.delete();

    const all = await SoftItem.withTrashed().get();
    expect(all.length).toBe(2);
  });
});

describe('Model.onlyTrashed()', () => {
  it('returns only soft-deleted rows', async () => {
    await SoftItem.create({ name: 'StillLive' });
    const dead = await SoftItem.create({ name: 'Trashed' });
    await dead.delete();

    const trashed = await SoftItem.onlyTrashed().get();
    expect(trashed.length).toBe(1);
    expect(trashed.first()!._attributes.name).toBe('Trashed');
  });
});

describe('model.restore()', () => {
  it('clears deleted_at so the row appears in normal queries again', async () => {
    const item = await SoftItem.create({ name: 'Restored' });
    await item.delete();

    expect((await SoftItem.all()).length).toBe(0);

    await (item as any).restore();

    const all = await SoftItem.all();
    expect(all.length).toBe(1);
    expect(all.first()!._attributes.name).toBe('Restored');
    expect((item as any).trashed()).toBe(false);
  });
});

describe('model.forceDelete()', () => {
  it('permanently removes the row from the database', async () => {
    const item = await SoftItem.create({ name: 'ForceDeleted' });
    const id = item._attributes.id;

    await (item as any).forceDelete();

    const rows = await ConnectionManager.getConnection('softdelete').query(
      'SELECT * FROM soft_items WHERE id = ?',
      [id]
    );
    expect(rows.rows.length).toBe(0);
    expect(item.exists).toBe(false);
  });
});
