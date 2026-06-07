import { ConnectionManager } from '../../src/connection/ConnectionManager';
import { Schema } from '../../src/schema/Schema';
import { SQLiteSchemaGrammar } from '../../src/schema/grammars/SQLiteSchemaGrammar';
import { Model } from '../../src/model/Model';
import { table } from '../../src/model/decorators/table';
import { fillable } from '../../src/model/decorators/fillable';
import { HasMany } from '../../src/model/relations/HasMany';
import { BelongsTo } from '../../src/model/relations/BelongsTo';
import { HasOne } from '../../src/model/relations/HasOne';
import { BelongsToMany } from '../../src/model/relations/BelongsToMany';

// ── Model definitions ─────────────────────────────────────────────────────

@table({ name: 'rel_users', timestamps: false, connection: 'relations' })
@fillable(['name'])
class RelUser extends Model {
  declare name: string;

  posts(): HasMany<RelPost> {
    return this.hasMany(RelPost, 'user_id', 'id');
  }

  profile(): HasOne<RelProfile> {
    return this.hasOne(RelProfile, 'user_id', 'id');
  }

  roles(): BelongsToMany<RelRole> {
    return this.belongsToMany(RelRole, 'rel_role_rel_user', 'rel_user_id', 'rel_role_id', 'id', 'id');
  }
}

@table({ name: 'rel_posts', timestamps: false, connection: 'relations' })
@fillable(['title', 'user_id'])
class RelPost extends Model {
  declare title: string;
  declare user_id: number;

  user(): BelongsTo<RelUser> {
    return this.belongsTo(RelUser, 'user_id', 'id');
  }
}

@table({ name: 'rel_profiles', timestamps: false, connection: 'relations' })
@fillable(['bio', 'user_id'])
class RelProfile extends Model {
  declare bio: string;
  declare user_id: number;
}

@table({ name: 'rel_roles', timestamps: false, connection: 'relations' })
@fillable(['name'])
class RelRole extends Model {
  declare name: string;

  users(): BelongsToMany<RelUser> {
    return this.belongsToMany(RelUser, 'rel_role_rel_user', 'rel_role_id', 'rel_user_id', 'id', 'id');
  }
}

// ── Setup ─────────────────────────────────────────────────────────────────

beforeAll(async () => {
  ConnectionManager.addConnection('relations', {
    driver: 'sqlite',
    filename: ':memory:',
  });
  Schema.useGrammar(new SQLiteSchemaGrammar());

  const conn = 'relations';

  await Schema.create('rel_users', (t) => {
    t.id();
    t.string('name');
  }, conn);
  await Schema.create('rel_posts', (t) => {
    t.id();
    t.string('title');
    t.integer('user_id');
  }, conn);
  await Schema.create('rel_profiles', (t) => {
    t.id();
    t.string('bio');
    t.integer('user_id');
  }, conn);
  await Schema.create('rel_roles', (t) => {
    t.id();
    t.string('name');
  }, conn);
  await Schema.create('rel_role_rel_user', (t) => {
    t.integer('rel_user_id');
    t.integer('rel_role_id');
  }, conn);
});

afterAll(async () => {
  await ConnectionManager.disconnectAll();
});

beforeEach(async () => {
  const db = ConnectionManager.getConnection('relations');
  await db.query('DELETE FROM rel_role_rel_user');
  await db.query('DELETE FROM rel_profiles');
  await db.query('DELETE FROM rel_posts');
  await db.query('DELETE FROM rel_users');
  await db.query('DELETE FROM rel_roles');
});

// ── Tests ─────────────────────────────────────────────────────────────────

describe('hasMany', () => {
  it('user.posts().get() returns posts belonging to that user', async () => {
    const user = await RelUser.create({ name: 'Alice' });
    const other = await RelUser.create({ name: 'Bob' });

    await RelPost.create({ title: 'Post 1', user_id: user._attributes.id });
    await RelPost.create({ title: 'Post 2', user_id: user._attributes.id });
    await RelPost.create({ title: 'Post 3', user_id: other._attributes.id });

    const posts = await user.posts().get();
    expect(posts.length).toBe(2);
    for (const p of posts) {
      expect(p._attributes.user_id).toBe(user._attributes.id);
    }
  });
});

describe('belongsTo', () => {
  it('post.user().first() returns the correct parent user', async () => {
    const user = await RelUser.create({ name: 'Charlie' });
    const post = await RelPost.create({ title: 'My Post', user_id: user._attributes.id });

    const result = await post.user().first();
    expect(result).not.toBeNull();
    expect(result!._attributes.id).toBe(user._attributes.id);
    expect(result!._attributes.name).toBe('Charlie');
  });
});

describe('hasOne', () => {
  it('user.profile().first() returns the single related profile', async () => {
    const user = await RelUser.create({ name: 'Dana' });
    await RelProfile.create({ bio: 'Hello world', user_id: user._attributes.id });

    const profile = await user.profile().first();
    expect(profile).not.toBeNull();
    expect(profile!._attributes.bio).toBe('Hello world');
  });
});

describe('belongsToMany', () => {
  it('user.roles().get() returns roles via pivot table', async () => {
    const user = await RelUser.create({ name: 'Eve' });
    const admin = await RelRole.create({ name: 'admin' });
    const editor = await RelRole.create({ name: 'editor' });

    await ConnectionManager.getConnection('relations').query(
      'INSERT INTO rel_role_rel_user (rel_user_id, rel_role_id) VALUES (?, ?)',
      [user._attributes.id, admin._attributes.id]
    );
    await ConnectionManager.getConnection('relations').query(
      'INSERT INTO rel_role_rel_user (rel_user_id, rel_role_id) VALUES (?, ?)',
      [user._attributes.id, editor._attributes.id]
    );

    const roles = await user.roles().get();
    expect(roles.length).toBe(2);
    const names = roles.map((r) => r._attributes.name as string).sort();
    expect(names).toEqual(['admin', 'editor']);
  });
});

describe('eager loading with .with()', () => {
  it('RelUser.with("posts").get() loads all posts without N+1', async () => {
    const u1 = await RelUser.create({ name: 'Frank' });
    const u2 = await RelUser.create({ name: 'Grace' });

    await RelPost.create({ title: 'F1', user_id: u1._attributes.id });
    await RelPost.create({ title: 'F2', user_id: u1._attributes.id });
    await RelPost.create({ title: 'G1', user_id: u2._attributes.id });

    // Prevent lazy loading to ensure eager loading actually ran
    Model.preventLazyLoading(true);
    try {
      const users = await RelUser.query().with('posts').get();
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
