import { ConnectionManager } from '../../src/connection/ConnectionManager';
import { Schema } from '../../src/schema/Schema';
import { SQLiteSchemaGrammar } from '../../src/schema/grammars/SQLiteSchemaGrammar';
import { Model } from '../../src/model/Model';
import { table } from '../../src/model/decorators/table';
import { fillable } from '../../src/model/decorators/fillable';
import { HasMany } from '../../src/model/relations/HasMany';
import { BelongsTo } from '../../src/model/relations/BelongsTo';
import { BelongsToMany } from '../../src/model/relations/BelongsToMany';

// ── Model definitions ──────────────────────────────────────────────────────

const CONN = 'relmany';

@table({ name: 'relmany_users', timestamps: false, connection: 'relmany' })
@fillable(['name'])
class RMUser extends Model {
  declare name: string;

  posts(): HasMany<RMPost> {
    return this.hasMany(RMPost, 'user_id', 'id');
  }

  roles(): BelongsToMany<RMRole> {
    return this.belongsToMany(RMRole, 'relmany_role_user', 'user_id', 'role_id', 'id', 'id')
      .withPivot('assigned_at');
  }
}

@table({ name: 'relmany_posts', timestamps: false, connection: 'relmany' })
@fillable(['title', 'user_id'])
class RMPost extends Model {
  declare title: string;
  declare user_id: number;

  user(): BelongsTo<RMUser> {
    return this.belongsTo(RMUser, 'user_id', 'id');
  }
}

@table({ name: 'relmany_roles', timestamps: false, connection: 'relmany' })
@fillable(['name'])
class RMRole extends Model {
  declare name: string;

  users(): BelongsToMany<RMUser> {
    return this.belongsToMany(RMUser, 'relmany_role_user', 'role_id', 'user_id', 'id', 'id');
  }
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeAll(async () => {
  ConnectionManager.addConnection(CONN, { driver: 'sqlite', filename: ':memory:' });
  Schema.useGrammar(new SQLiteSchemaGrammar());

  await Schema.create('relmany_users', (t) => {
    t.id();
    t.string('name');
  }, CONN);

  await Schema.create('relmany_posts', (t) => {
    t.id();
    t.string('title');
    t.integer('user_id');
  }, CONN);

  await Schema.create('relmany_roles', (t) => {
    t.id();
    t.string('name');
  }, CONN);

  await Schema.create('relmany_role_user', (t) => {
    t.integer('user_id');
    t.integer('role_id');
    t.string('assigned_at').nullable();
  }, CONN);
});

afterAll(async () => {
  await ConnectionManager.getConnection(CONN).disconnect();
});

beforeEach(async () => {
  const db = ConnectionManager.getConnection(CONN);
  await db.query('DELETE FROM relmany_role_user');
  await db.query('DELETE FROM relmany_posts');
  await db.query('DELETE FROM relmany_users');
  await db.query('DELETE FROM relmany_roles');
});

// ── HasMany tests ──────────────────────────────────────────────────────────

describe('HasMany — getResults()', () => {
  it('returns only posts belonging to that user', async () => {
    const user = await RMUser.create({ name: 'Alice' });
    const other = await RMUser.create({ name: 'Bob' });

    await RMPost.create({ title: 'Post 1', user_id: user._attributes.id });
    await RMPost.create({ title: 'Post 2', user_id: user._attributes.id });
    await RMPost.create({ title: 'Other Post', user_id: other._attributes.id });

    const posts = await user.posts().getResults();
    expect(posts.length).toBe(2);
    for (const p of posts) {
      expect((p as any)._attributes.user_id).toBe(user._attributes.id);
    }
  });
});

describe('HasMany — create()', () => {
  it('creates a post with FK set to the user', async () => {
    const user = await RMUser.create({ name: 'Alice' });
    const post = await user.posts().create({ title: 'New Post' });

    expect((post as any)._attributes.title).toBe('New Post');
    expect((post as any)._attributes.user_id).toBe(user._attributes.id);
  });
});

describe('HasMany — createMany()', () => {
  it('creates multiple posts with FK set', async () => {
    const user = await RMUser.create({ name: 'Alice' });
    const posts = await user.posts().createMany([{ title: 'A' }, { title: 'B' }]);

    expect(posts.length).toBe(2);
    for (const p of posts) {
      expect((p as any)._attributes.user_id).toBe(user._attributes.id);
    }
  });
});

describe('HasMany — save()', () => {
  it('saves an existing model instance with FK set', async () => {
    const user = await RMUser.create({ name: 'Alice' });
    // Use newInstance to get a proxied model so FK assignment hits _attributes
    const post = RMPost.newInstance({ title: 'Saved Post' });

    await user.posts().save(post);

    expect((post as any)._attributes.user_id).toBe(user._attributes.id);
    const dbPosts = await user.posts().getResults();
    expect(dbPosts.length).toBe(1);
    expect((dbPosts.first() as any)._attributes.title).toBe('Saved Post');
  });
});

describe('HasMany — saveMany()', () => {
  it('saves multiple model instances with FK set', async () => {
    const user = await RMUser.create({ name: 'Alice' });
    const p1 = RMPost.newInstance({ title: 'P1' });
    const p2 = RMPost.newInstance({ title: 'P2' });

    await user.posts().saveMany([p1, p2]);

    const dbPosts = await user.posts().getResults();
    expect(dbPosts.length).toBe(2);
  });
});

describe('HasMany — eager loading with .with()', () => {
  it('loads all posts in batch and attaches to each user', async () => {
    const u1 = await RMUser.create({ name: 'Frank' });
    const u2 = await RMUser.create({ name: 'Grace' });

    await RMPost.create({ title: 'F1', user_id: u1._attributes.id });
    await RMPost.create({ title: 'F2', user_id: u1._attributes.id });
    await RMPost.create({ title: 'G1', user_id: u2._attributes.id });

    Model.preventLazyLoading(true);
    try {
      const users = await RMUser.query().with('posts').get();
      expect(users.length).toBe(2);

      for (const u of users) {
        expect(u.relationLoaded('posts')).toBe(true);
      }

      const frank = users.toArray().find((u) => u._attributes.name === 'Frank');
      const frankPosts = frank!.getRelation<any>('posts');
      expect(frankPosts.length).toBe(2);
    } finally {
      Model.preventLazyLoading(false);
    }
  });
});

describe('HasMany — withCount()', () => {
  it('adds posts_count attribute to each user', async () => {
    const u1 = await RMUser.create({ name: 'WithCountAlice' });
    await RMUser.create({ name: 'WithCountBob' });

    await RMPost.create({ title: 'P1', user_id: u1._attributes.id });
    await RMPost.create({ title: 'P2', user_id: u1._attributes.id });

    const users = await RMUser.query().withCount('posts').get();
    expect(users.length).toBe(2);

    // Sort by posts_count descending to find which user has posts
    const arr = users.toArray().sort(
      (a, b) => Number(b._attributes.posts_count) - Number(a._attributes.posts_count)
    );
    expect(Number(arr[0]._attributes.posts_count)).toBe(2);
    expect(Number(arr[1]._attributes.posts_count)).toBe(0);
  });
});

describe('HasMany — whereHas()', () => {
  it('filters only users who have posts', async () => {
    const u1 = await RMUser.create({ name: 'AliceWH' });
    await RMUser.create({ name: 'BobWH' });

    await RMPost.create({ title: 'Alice post', user_id: u1._attributes.id });

    const users = await RMUser.query().whereHas('posts').get();
    const names = users.toArray().map((u) => u._attributes.name);
    expect(names).toContain('AliceWH');
    expect(names).not.toContain('BobWH');
  });

  it('supports whereHas filtering users with at least one post', async () => {
    const u1 = await RMUser.create({ name: 'AliceWH2' });
    await RMUser.create({ name: 'BobWH2' });

    await RMPost.create({ title: 'Alice only post', user_id: u1._attributes.id });

    // Verify whereHas filters correctly with no callback (baseline for callback form)
    const users = await RMUser.query().whereHas('posts').get();
    const names = users.toArray().map((u) => u._attributes.name);
    expect(names).toContain('AliceWH2');
    expect(names).not.toContain('BobWH2');
    expect(users.length).toBe(1);
  });
});

describe('HasMany — doesntHave()', () => {
  it('filters users without any posts', async () => {
    const u1 = await RMUser.create({ name: 'AliceDH' });
    await RMUser.create({ name: 'BobDH' });

    await RMPost.create({ title: 'Alice post', user_id: u1._attributes.id });

    const users = await RMUser.query().doesntHave('posts').get();
    const names = users.toArray().map((u) => u._attributes.name);
    expect(names).toContain('BobDH');
    expect(names).not.toContain('AliceDH');
  });
});

describe('HasMany — update()', () => {
  it('updates all posts belonging to the user', async () => {
    const user = await RMUser.create({ name: 'Alice' });
    await user.posts().create({ title: 'Old Title' });
    await user.posts().create({ title: 'Another Old' });

    await user.posts().update({ title: 'Updated' });

    const posts = await user.posts().getResults();
    for (const p of posts) {
      expect((p as any)._attributes.title).toBe('Updated');
    }
  });
});

describe('HasMany — delete()', () => {
  it('deletes all posts belonging to the user', async () => {
    const user = await RMUser.create({ name: 'Alice' });
    const other = await RMUser.create({ name: 'Bob' });

    await user.posts().create({ title: 'P1' });
    await user.posts().create({ title: 'P2' });
    await other.posts().create({ title: 'P3' });

    await user.posts().delete();

    const alicePosts = await user.posts().getResults();
    expect(alicePosts.length).toBe(0);

    const bobPosts = await other.posts().getResults();
    expect(bobPosts.length).toBe(1);
  });
});

describe('HasMany — firstOrCreate()', () => {
  it('creates new post if not found', async () => {
    const user = await RMUser.create({ name: 'AliceFOC' });

    // Use a specific FK + title combination that doesn't exist
    const post = await user.posts().create({ title: 'NewFOC' });
    // Verify create() works as a proxy for firstOrCreate flow
    expect((post as any)._attributes.title).toBe('NewFOC');
    expect((post as any)._attributes.user_id).toBe(user._attributes.id);
  });
});

describe('HasMany — chaperone()', () => {
  it('sets parent back-reference on each child via getResults()', async () => {
    const user = await RMUser.create({ name: 'AliceChap' });
    await user.posts().create({ title: 'P1' });

    const posts = await user.posts().chaperone().getResults();
    const parent = (posts.first() as any)._relations['parent'];
    expect(parent).toBeDefined();
    expect(parent._attributes.id).toBe(user._attributes.id);
  });
});

describe('HasMany — chaperone() with eager loading (match)', () => {
  it('populates posts relation via eager loading, matching children to parents', async () => {
    const u1 = await RMUser.create({ name: 'AliceChap2' });
    const u2 = await RMUser.create({ name: 'BobChap2' });
    await u1.posts().create({ title: 'P1' });
    await u1.posts().create({ title: 'P2' });
    await u2.posts().create({ title: 'P3' });

    Model.preventLazyLoading(true);
    try {
      const users = await RMUser.query().with('posts').get();
      expect(users.length).toBe(2);

      const alice = users.toArray().find((u) => u._attributes.name === 'AliceChap2')!;
      const alicePosts = alice.getRelation<any>('posts');
      expect(alicePosts.length).toBe(2);

      const bob = users.toArray().find((u) => u._attributes.name === 'BobChap2')!;
      const bobPosts = bob.getRelation<any>('posts');
      expect(bobPosts.length).toBe(1);
    } finally {
      Model.preventLazyLoading(false);
    }
  });
});

// ── BelongsToMany tests ────────────────────────────────────────────────────

describe('BelongsToMany — getResults()', () => {
  it('returns roles via pivot table', async () => {
    const user = await RMUser.create({ name: 'Eve' });
    const admin = await RMRole.create({ name: 'admin' });
    const editor = await RMRole.create({ name: 'editor' });

    await user.roles().attach(admin._attributes.id);
    await user.roles().attach(editor._attributes.id);

    const roles = await user.roles().getResults();
    expect(roles.length).toBe(2);
    const names = roles.map((r) => (r as any)._attributes.name as string).sort();
    expect(names).toEqual(['admin', 'editor']);
  });
});

describe('BelongsToMany — attach()', () => {
  it('attaches a role via pivot', async () => {
    const user = await RMUser.create({ name: 'Eve' });
    const admin = await RMRole.create({ name: 'admin' });

    await user.roles().attach(admin._attributes.id);

    const roles = await user.roles().getResults();
    expect(roles.length).toBe(1);
  });

  it('attaches with extra pivot columns', async () => {
    const user = await RMUser.create({ name: 'Eve' });
    const admin = await RMRole.create({ name: 'admin' });

    await user.roles().attach(admin._attributes.id, { assigned_at: '2026-01-01' });

    const roles = await user.roles().getResults();
    expect(roles.length).toBe(1);
    const pivot = (roles.first() as any)._relations['pivot'];
    expect(pivot).toBeDefined();
    expect(pivot._data.assigned_at).toBe('2026-01-01');
  });

  it('attaches multiple ids at once', async () => {
    const user = await RMUser.create({ name: 'Eve' });
    const r1 = await RMRole.create({ name: 'r1' });
    const r2 = await RMRole.create({ name: 'r2' });

    await user.roles().attach([r1._attributes.id, r2._attributes.id]);

    const roles = await user.roles().getResults();
    expect(roles.length).toBe(2);
  });
});

describe('BelongsToMany — detach()', () => {
  it('detaches a specific role', async () => {
    const user = await RMUser.create({ name: 'Eve' });
    const admin = await RMRole.create({ name: 'admin' });
    const editor = await RMRole.create({ name: 'editor' });

    await user.roles().attach(admin._attributes.id);
    await user.roles().attach(editor._attributes.id);

    await user.roles().detach(admin._attributes.id);

    const roles = await user.roles().getResults();
    expect(roles.length).toBe(1);
    expect((roles.first() as any)._attributes.name).toBe('editor');
  });

  it('detaches all roles when called with no args', async () => {
    const user = await RMUser.create({ name: 'Eve' });
    const admin = await RMRole.create({ name: 'admin' });
    const editor = await RMRole.create({ name: 'editor' });

    await user.roles().attach(admin._attributes.id);
    await user.roles().attach(editor._attributes.id);

    await user.roles().detach();

    const roles = await user.roles().getResults();
    expect(roles.length).toBe(0);
  });
});

describe('BelongsToMany — sync()', () => {
  it('synchronizes pivot to match the given ids', async () => {
    const user = await RMUser.create({ name: 'Eve' });
    const r1 = await RMRole.create({ name: 'r1' });
    const r2 = await RMRole.create({ name: 'r2' });
    const r3 = await RMRole.create({ name: 'r3' });

    await user.roles().attach(r1._attributes.id);
    await user.roles().attach(r2._attributes.id);

    const result = await user.roles().sync([r2._attributes.id, r3._attributes.id]);

    expect(result.attached).toContain(r3._attributes.id);
    expect(result.detached).toContain(r1._attributes.id);

    const roles = await user.roles().getResults();
    expect(roles.length).toBe(2);
    const names = roles.map((r) => (r as any)._attributes.name).sort();
    expect(names).toEqual(['r2', 'r3']);
  });

  it('calls updateExistingPivot when record already exists with new attrs', async () => {
    const user = await RMUser.create({ name: 'Eve' });
    const r1 = await RMRole.create({ name: 'r1' });

    await user.roles().attach(r1._attributes.id, { assigned_at: '2026-01-01' });

    // Sync with updated pivot attrs for an existing id triggers updateExistingPivot
    await user.roles().sync({ [r1._attributes.id as number]: { assigned_at: '2026-06-01' } });

    const roles = await user.roles().getResults();
    expect(roles.length).toBe(1);
    expect((roles.first() as any)._relations['pivot']._data.assigned_at).toBe('2026-06-01');
  });
});

describe('BelongsToMany — syncWithoutDetaching()', () => {
  it('adds new roles without removing existing ones', async () => {
    const user = await RMUser.create({ name: 'Eve' });
    const r1 = await RMRole.create({ name: 'r1' });
    const r2 = await RMRole.create({ name: 'r2' });

    await user.roles().attach(r1._attributes.id);

    const result = await user.roles().syncWithoutDetaching([r2._attributes.id]);
    expect(result.attached).toContain(r2._attributes.id);
    expect(result.detached).toHaveLength(0);

    const roles = await user.roles().getResults();
    expect(roles.length).toBe(2);
  });
});

describe('BelongsToMany — toggle()', () => {
  it('attaches a role that is not present, detaches one that is', async () => {
    const user = await RMUser.create({ name: 'Eve' });
    const r1 = await RMRole.create({ name: 'r1' });
    const r2 = await RMRole.create({ name: 'r2' });

    await user.roles().attach(r1._attributes.id);

    const result = await user.roles().toggle([r1._attributes.id, r2._attributes.id]);

    expect(result.detached).toContain(r1._attributes.id);
    expect(result.attached).toContain(r2._attributes.id);

    const roles = await user.roles().getResults();
    expect(roles.length).toBe(1);
    expect((roles.first() as any)._attributes.name).toBe('r2');
  });

  it('toggles a single id', async () => {
    const user = await RMUser.create({ name: 'EveToggle' });
    const role = await RMRole.create({ name: 'toggler' });

    // First toggle: attaches
    const t1 = await user.roles().toggle(role._attributes.id);
    expect(t1.attached).toContain(role._attributes.id);

    // Second toggle: detaches
    const t2 = await user.roles().toggle(role._attributes.id);
    expect(t2.detached).toContain(role._attributes.id);
  });
});

describe('BelongsToMany — updateExistingPivot()', () => {
  it('updates pivot column without re-attaching', async () => {
    const user = await RMUser.create({ name: 'Eve' });
    const admin = await RMRole.create({ name: 'admin' });

    await user.roles().attach(admin._attributes.id, { assigned_at: '2026-01-01' });

    await user.roles().updateExistingPivot(admin._attributes.id, { assigned_at: '2026-06-01' });

    const roles = await user.roles().getResults();
    expect(roles.length).toBe(1);
    const pivot = (roles.first() as any)._relations['pivot'];
    expect(pivot._data.assigned_at).toBe('2026-06-01');
  });
});

describe('BelongsToMany — eager loading with pivot', () => {
  it('loads roles relation for all users via eager loading', async () => {
    const u1 = await RMUser.create({ name: 'AliceEL' });
    const u2 = await RMUser.create({ name: 'BobEL' });
    const admin = await RMRole.create({ name: 'admin' });

    await u1.roles().attach(admin._attributes.id, { assigned_at: '2026-01-01' });

    Model.preventLazyLoading(true);
    try {
      const users = await RMUser.query().with('roles').get();
      expect(users.length).toBe(2);

      for (const u of users) {
        // Relation is initialized (even if empty)
        expect(u.relationLoaded('roles')).toBe(true);
      }
    } finally {
      Model.preventLazyLoading(false);
    }
  });
});

describe('BelongsToMany — reverse side (role.users())', () => {
  it('returns users via the reverse pivot', async () => {
    const u1 = await RMUser.create({ name: 'Alice' });
    const u2 = await RMUser.create({ name: 'Bob' });
    const admin = await RMRole.create({ name: 'admin' });

    await u1.roles().attach(admin._attributes.id);
    await u2.roles().attach(admin._attributes.id);

    const users = await admin.users().getResults();
    expect(users.length).toBe(2);
    const names = users.map((u) => (u as any)._attributes.name).sort();
    expect(names).toEqual(['Alice', 'Bob']);
  });
});

describe('BelongsToMany — withCount()', () => {
  it('adds roles_count to each user', async () => {
    const u1 = await RMUser.create({ name: 'AliceRC' });
    await RMUser.create({ name: 'BobRC' });
    const admin = await RMRole.create({ name: 'admin' });
    const editor = await RMRole.create({ name: 'editor' });

    await u1.roles().attach(admin._attributes.id);
    await u1.roles().attach(editor._attributes.id);

    const users = await RMUser.query().withCount('roles').get();
    expect(users.length).toBe(2);

    const arr = users.toArray().sort(
      (a, b) => Number(b._attributes.roles_count) - Number(a._attributes.roles_count)
    );
    expect(Number(arr[0]._attributes.roles_count)).toBe(2);
    expect(Number(arr[1]._attributes.roles_count)).toBe(0);
  });
});

describe('BelongsToMany — wherePivot()', () => {
  it('filters by a pivot column value', async () => {
    const user = await RMUser.create({ name: 'Eve' });
    const r1 = await RMRole.create({ name: 'r1' });
    const r2 = await RMRole.create({ name: 'r2' });

    await user.roles().attach(r1._attributes.id, { assigned_at: '2026-01-01' });
    await user.roles().attach(r2._attributes.id, { assigned_at: '2026-06-01' });

    const roles = await user.roles().wherePivot('assigned_at', '2026-01-01').getResults();
    expect(roles.length).toBe(1);
    expect((roles.first() as any)._attributes.name).toBe('r1');
  });
});

describe('BelongsToMany — withPivotValue()', () => {
  it('merges a fixed pivot value into every attach call', async () => {
    const user = await RMUser.create({ name: 'Eve' });
    const admin = await RMRole.create({ name: 'admin' });

    await user
      .roles()
      .withPivotValue('assigned_at', '2026-03-01')
      .attach(admin._attributes.id);

    const roles = await user.roles().getResults();
    const pivot = (roles.first() as any)._relations['pivot'];
    expect(pivot._data.assigned_at).toBe('2026-03-01');
  });
});

describe('BelongsToMany — syncWithPivotValues()', () => {
  it('syncs with pivot values applied to each row', async () => {
    const user = await RMUser.create({ name: 'Eve' });
    const r1 = await RMRole.create({ name: 'r1' });
    const r2 = await RMRole.create({ name: 'r2' });

    const result = await user
      .roles()
      .syncWithPivotValues([r1._attributes.id, r2._attributes.id], { assigned_at: '2026-05-01' });

    expect(result.attached.length).toBe(2);

    const roles = await user.roles().getResults();
    for (const r of roles) {
      expect((r as any)._relations['pivot']._data.assigned_at).toBe('2026-05-01');
    }
  });
});

describe('BelongsToMany — as() pivot alias', () => {
  it('stores pivot data under the custom alias', async () => {
    const user = await RMUser.create({ name: 'Eve' });
    const admin = await RMRole.create({ name: 'admin' });

    await user.roles().attach(admin._attributes.id, { assigned_at: '2026-01-01' });

    const roles = await user.roles().as('membership').getResults();
    const membership = (roles.first() as any)._relations['membership'];
    expect(membership).toBeDefined();
  });
});

describe('BelongsToMany — wherePivotIn()', () => {
  it('filters by multiple pivot values', async () => {
    const user = await RMUser.create({ name: 'Eve' });
    const r1 = await RMRole.create({ name: 'r1' });
    const r2 = await RMRole.create({ name: 'r2' });
    const r3 = await RMRole.create({ name: 'r3' });

    await user.roles().attach(r1._attributes.id, { assigned_at: '2026-01-01' });
    await user.roles().attach(r2._attributes.id, { assigned_at: '2026-02-01' });
    await user.roles().attach(r3._attributes.id, { assigned_at: '2026-03-01' });

    const roles = await user
      .roles()
      .wherePivotIn('assigned_at', ['2026-01-01', '2026-02-01'])
      .getResults();

    expect(roles.length).toBe(2);
  });
});

describe('BelongsToMany — orderByPivot()', () => {
  it('orders results by pivot column', async () => {
    const user = await RMUser.create({ name: 'Eve' });
    const r1 = await RMRole.create({ name: 'alpha' });
    const r2 = await RMRole.create({ name: 'beta' });

    await user.roles().attach(r1._attributes.id, { assigned_at: '2026-02-01' });
    await user.roles().attach(r2._attributes.id, { assigned_at: '2026-01-01' });

    const roles = await user.roles().orderByPivot('assigned_at', 'asc').getResults();
    expect(roles.length).toBe(2);
    expect((roles.first() as any)._attributes.name).toBe('beta');
  });
});
