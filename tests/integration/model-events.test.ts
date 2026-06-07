import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ConnectionManager } from '../../src/connection/ConnectionManager';
import { Schema } from '../../src/schema/Schema';
import { SQLiteSchemaGrammar } from '../../src/schema/grammars/SQLiteSchemaGrammar';
import { Model } from '../../src/model/Model';
import { table } from '../../src/model/decorators/table';
import { fillable } from '../../src/model/decorators/fillable';
import { observedBy } from '../../src/model/decorators/observe';
import { ModelMetadata } from '../../src/model/ModelMetadata';
import { EventDispatcher } from '../../src/model/events/EventDispatcher';
import { Observer } from '../../src/model/events/Observer';

// ── Connection name ───────────────────────────────────────────────────────────

const CONN = 'events';

// ── Base model ────────────────────────────────────────────────────────────────

@table({ name: 'evt_users', timestamps: false, connection: CONN })
@fillable(['name', 'email'])
class EvtUser extends Model {
  declare name: string;
  declare email: string;
}

// ── Observer used by decorator tests ─────────────────────────────────────────

class EvtUserObserver implements Observer<EvtUser> {
  public static calls: string[] = [];

  creating(model: EvtUser) {
    EvtUserObserver.calls.push('obs:creating');
  }
  created(model: EvtUser) {
    EvtUserObserver.calls.push('obs:created');
  }
  updating(model: EvtUser) {
    EvtUserObserver.calls.push('obs:updating');
  }
  updated(model: EvtUser) {
    EvtUserObserver.calls.push('obs:updated');
  }
  saving(model: EvtUser) {
    EvtUserObserver.calls.push('obs:saving');
  }
  saved(model: EvtUser) {
    EvtUserObserver.calls.push('obs:saved');
  }
  deleting(model: EvtUser) {
    EvtUserObserver.calls.push('obs:deleting');
  }
  deleted(model: EvtUser) {
    EvtUserObserver.calls.push('obs:deleted');
  }
}

// ── Model with @observedBy decorator ─────────────────────────────────────────

@table({ name: 'evt_users', timestamps: false, connection: CONN })
@fillable(['name', 'email'])
@observedBy([EvtUserObserver])
class ObservedUser extends Model {
  declare name: string;
  declare email: string;
}

// ── Helper: reset dispatcher between tests ────────────────────────────────────

function resetListeners(ModelClass: typeof Model) {
  ModelMetadata.get(ModelClass as unknown as Function).dispatcher = new EventDispatcher();
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  ConnectionManager.addConnection(CONN, { driver: 'sqlite', filename: ':memory:' });
  Schema.useGrammar(new SQLiteSchemaGrammar());
  await Schema.create('evt_users', (t) => {
    t.increments('id');
    t.string('name');
    t.string('email');
  }, CONN);
});

afterAll(async () => {
  await ConnectionManager.getConnection(CONN).disconnect();
});

beforeEach(async () => {
  await ConnectionManager.getConnection(CONN).query('DELETE FROM evt_users', []);
  resetListeners(EvtUser);
  EvtUserObserver.calls = [];
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('creating / created events', () => {
  it('fires creating before insert', async () => {
    let called = false;
    EvtUser.creating(() => { called = true; });
    await EvtUser.create({ name: 'Alice', email: 'alice@example.com' });
    expect(called).toBe(true);
  });

  it('fires created after insert', async () => {
    let called = false;
    EvtUser.created(() => { called = true; });
    await EvtUser.create({ name: 'Alice', email: 'alice@example.com' });
    expect(called).toBe(true);
  });

  it('passes the model instance to the listener', async () => {
    let received: EvtUser | null = null;
    EvtUser.created((m) => { received = m as EvtUser; });
    await EvtUser.create({ name: 'Bob', email: 'bob@example.com' });
    expect(received).not.toBeNull();
    expect((received as unknown as EvtUser).name).toBe('Bob');
  });
});

describe('updating / updated events', () => {
  it('fires updating before update', async () => {
    let called = false;
    EvtUser.updating(() => { called = true; });
    const user = await EvtUser.create({ name: 'Carol', email: 'carol@example.com' });
    resetListeners(EvtUser); // clear creating/created from above
    called = false;
    EvtUser.updating(() => { called = true; });
    user.name = 'Carol Updated';
    await user.save();
    expect(called).toBe(true);
  });

  it('fires updated after update', async () => {
    const user = await EvtUser.create({ name: 'Dave', email: 'dave@example.com' });
    resetListeners(EvtUser);
    let called = false;
    EvtUser.updated(() => { called = true; });
    user.name = 'Dave Updated';
    await user.save();
    expect(called).toBe(true);
  });
});

describe('deleting / deleted events', () => {
  it('fires deleting before delete', async () => {
    let called = false;
    EvtUser.deleting(() => { called = true; });
    const user = await EvtUser.create({ name: 'Eve', email: 'eve@example.com' });
    await user.delete();
    expect(called).toBe(true);
  });

  it('fires deleted after delete', async () => {
    let called = false;
    EvtUser.deleted(() => { called = true; });
    const user = await EvtUser.create({ name: 'Frank', email: 'frank@example.com' });
    await user.delete();
    expect(called).toBe(true);
  });
});

describe('saving / saved events', () => {
  it('fires saving and saved on create', async () => {
    let savingCalled = false;
    let savedCalled = false;
    EvtUser.saving(() => { savingCalled = true; });
    EvtUser.saved(() => { savedCalled = true; });
    await EvtUser.create({ name: 'Grace', email: 'grace@example.com' });
    expect(savingCalled).toBe(true);
    expect(savedCalled).toBe(true);
  });

  it('fires saving and saved on update', async () => {
    const user = await EvtUser.create({ name: 'Heidi', email: 'heidi@example.com' });
    resetListeners(EvtUser);
    let savingCalled = false;
    let savedCalled = false;
    EvtUser.saving(() => { savingCalled = true; });
    EvtUser.saved(() => { savedCalled = true; });
    user.name = 'Heidi Updated';
    await user.save();
    expect(savingCalled).toBe(true);
    expect(savedCalled).toBe(true);
  });
});

describe('cancellation via creating returning false', () => {
  it('aborts insert when creating listener returns false', async () => {
    EvtUser.creating(() => false);
    await EvtUser.create({ name: 'Ivan', email: 'ivan@example.com' });
    // The model should not have been persisted
    const queryResult = await ConnectionManager.getConnection(CONN).query('SELECT * FROM evt_users WHERE name = ?', ['Ivan']);
    expect(queryResult.rows).toHaveLength(0);
  });
});

describe('event order on create', () => {
  it('fires in order: saving → creating → created → saved', async () => {
    const order: string[] = [];
    EvtUser.saving(() => { order.push('saving'); });
    EvtUser.creating(() => { order.push('creating'); });
    EvtUser.created(() => { order.push('created'); });
    EvtUser.saved(() => { order.push('saved'); });
    await EvtUser.create({ name: 'Judy', email: 'judy@example.com' });
    expect(order).toEqual(['saving', 'creating', 'created', 'saved']);
  });
});

describe('withoutEvents', () => {
  it('suppresses all event listeners inside the callback', async () => {
    let called = false;
    EvtUser.creating(() => { called = true; });
    EvtUser.created(() => { called = true; });
    await EvtUser.withoutEvents(async () => {
      await EvtUser.create({ name: 'Karl', email: 'karl@example.com' });
    });
    expect(called).toBe(false);
  });

  it('restores events after the callback completes', async () => {
    let outerCalled = false;
    EvtUser.created(() => { outerCalled = true; });
    await EvtUser.withoutEvents(async () => {
      await EvtUser.create({ name: 'Temp', email: 'temp@example.com' });
    });
    expect(outerCalled).toBe(false);
    // Events should work again outside the block
    await EvtUser.create({ name: 'After', email: 'after@example.com' });
    expect(outerCalled).toBe(true);
  });
});

describe('Observer via @observedBy decorator', () => {
  beforeEach(() => {
    EvtUserObserver.calls = [];
  });

  it('calls observer creating and created on insert', async () => {
    await ObservedUser.create({ name: 'Leo', email: 'leo@example.com' });
    expect(EvtUserObserver.calls).toContain('obs:creating');
    expect(EvtUserObserver.calls).toContain('obs:created');
  });

  it('calls observer saving and saved on insert', async () => {
    await ObservedUser.create({ name: 'Mia', email: 'mia@example.com' });
    expect(EvtUserObserver.calls).toContain('obs:saving');
    expect(EvtUserObserver.calls).toContain('obs:saved');
  });

  it('calls observer updating and updated on update', async () => {
    const user = await ObservedUser.create({ name: 'Ned', email: 'ned@example.com' });
    EvtUserObserver.calls = [];
    user.name = 'Ned Updated';
    await user.save();
    expect(EvtUserObserver.calls).toContain('obs:updating');
    expect(EvtUserObserver.calls).toContain('obs:updated');
  });

  it('calls observer deleting and deleted on delete', async () => {
    const user = await ObservedUser.create({ name: 'Olive', email: 'olive@example.com' });
    EvtUserObserver.calls = [];
    await user.delete();
    expect(EvtUserObserver.calls).toContain('obs:deleting');
    expect(EvtUserObserver.calls).toContain('obs:deleted');
  });
});

describe('Observer via Model.observe()', () => {
  beforeEach(() => {
    EvtUserObserver.calls = [];
    // Use a fresh model class to avoid listener accumulation from decorator tests
    resetListeners(EvtUser);
    EvtUser.observe(new EvtUserObserver());
  });

  it('calls observer creating and created on insert', async () => {
    await EvtUser.create({ name: 'Pat', email: 'pat@example.com' });
    expect(EvtUserObserver.calls).toContain('obs:creating');
    expect(EvtUserObserver.calls).toContain('obs:created');
  });

  it('calls observer saving and saved on insert', async () => {
    await EvtUser.create({ name: 'Quinn', email: 'quinn@example.com' });
    expect(EvtUserObserver.calls).toContain('obs:saving');
    expect(EvtUserObserver.calls).toContain('obs:saved');
  });

  it('calls observer deleting and deleted on delete', async () => {
    const user = await EvtUser.create({ name: 'Rosa', email: 'rosa@example.com' });
    EvtUserObserver.calls = [];
    await user.delete();
    expect(EvtUserObserver.calls).toContain('obs:deleting');
    expect(EvtUserObserver.calls).toContain('obs:deleted');
  });
});
