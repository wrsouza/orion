import { ConnectionManager } from '../../src/connection/ConnectionManager';
import { Schema } from '../../src/schema/Schema';
import { SQLiteSchemaGrammar } from '../../src/schema/grammars/SQLiteSchemaGrammar';
import { Model } from '../../src/model/Model';
import { table } from '../../src/model/decorators/table';
import { fillable } from '../../src/model/decorators/fillable';
import { HasManyThrough } from '../../src/model/relations/HasManyThrough';
import { HasOneThrough } from '../../src/model/relations/HasOneThrough';
import { MorphToMany } from '../../src/model/relations/MorphToMany';
import { MorphedByMany } from '../../src/model/relations/MorphedByMany';
import { MorphMap } from '../../src/model/MorphMap';

// ── Model definitions ──────────────────────────────────────────────────────

@table({ name: 'relthru_posts', timestamps: false, connection: 'relthru' })
@fillable(['title', 'user_id'])
class RTPost extends Model {
  declare title: string;
  declare user_id: number;

  tags(): MorphToMany<RTTag> {
    return this.morphToMany(RTTag, 'taggable', 'relthru_taggables', 'tag_id', 'id', 'id');
  }
}

@table({ name: 'relthru_users', timestamps: false, connection: 'relthru' })
@fillable(['name', 'country_id'])
class RTUser extends Model {
  declare name: string;
  declare country_id: number;

  posts(): any {
    return this.hasMany(RTPost, 'user_id');
  }

  country(): any {
    return this.belongsTo(RTCountry, 'country_id');
  }
}

@table({ name: 'relthru_countries', timestamps: false, connection: 'relthru' })
@fillable(['name'])
class RTCountry extends Model {
  declare name: string;

  posts(): HasManyThrough<RTPost> {
    return this.hasManyThrough(RTPost, RTUser, 'country_id', 'user_id', 'id', 'id');
  }

  latestPost(): HasOneThrough<RTPost> {
    return this.hasOneThrough(RTPost, RTUser, 'country_id', 'user_id', 'id', 'id');
  }
}

@table({ name: 'relthru_tags', timestamps: false, connection: 'relthru' })
@fillable(['name'])
class RTTag extends Model {
  declare name: string;

  posts(): MorphedByMany<RTPost> {
    return this.morphedByMany(RTPost, 'taggable', 'relthru_taggables', 'tag_id', 'id', 'id');
  }
}

// ── Setup ──────────────────────────────────────────────────────────────────

const CONN = 'relthru';

beforeAll(async () => {
  ConnectionManager.addConnection(CONN, { driver: 'sqlite', filename: ':memory:' });
  Schema.useGrammar(new SQLiteSchemaGrammar());

  await Schema.create('relthru_countries', (t) => {
    t.id();
    t.string('name');
  }, CONN);

  await Schema.create('relthru_users', (t) => {
    t.id();
    t.string('name');
    t.integer('country_id');
  }, CONN);

  await Schema.create('relthru_posts', (t) => {
    t.id();
    t.string('title');
    t.integer('user_id');
  }, CONN);

  await Schema.create('relthru_tags', (t) => {
    t.id();
    t.string('name');
  }, CONN);

  await Schema.create('relthru_taggables', (t) => {
    t.integer('tag_id');
    t.integer('taggable_id');
    t.string('taggable_type');
  }, CONN);

  MorphMap.enforce({
    RTPost: RTPost,
  });
});

afterAll(async () => {
  MorphMap.clear();
  await ConnectionManager.getConnection(CONN).disconnect();
});

beforeEach(async () => {
  const db = ConnectionManager.getConnection(CONN);
  await db.query('DELETE FROM relthru_taggables', []);
  await db.query('DELETE FROM relthru_posts', []);
  await db.query('DELETE FROM relthru_tags', []);
  await db.query('DELETE FROM relthru_users', []);
  await db.query('DELETE FROM relthru_countries', []);
});

// ── HasManyThrough ─────────────────────────────────────────────────────────

describe('HasManyThrough', () => {
  it('country.posts().getResults() returns posts belonging to users in that country', async () => {
    const country = await RTCountry.create({ name: 'Brazil' });
    const other = await RTCountry.create({ name: 'Argentina' });

    const countryId = country._attributes.id as number;
    const otherId = other._attributes.id as number;

    const user1 = await RTUser.create({ name: 'Alice', country_id: countryId });
    const user2 = await RTUser.create({ name: 'Bob', country_id: otherId });

    await RTPost.create({ title: 'Post A', user_id: user1._attributes.id as number });
    await RTPost.create({ title: 'Post B', user_id: user1._attributes.id as number });
    await RTPost.create({ title: 'Post C', user_id: user2._attributes.id as number });

    const posts = await country.posts().getResults();
    expect(posts.length).toBe(2);
    const titles = [...posts].map((p) => (p as any)._attributes.title as string).sort();
    expect(titles).toEqual(['Post A', 'Post B']);
  });

  it('country.posts().getResults() returns empty when no users or posts', async () => {
    const country = await RTCountry.create({ name: 'Empty Country' });
    const posts = await country.posts().getResults();
    expect(posts.length).toBe(0);
  });

  it('RTCountry.with("posts").get() eager loads posts for each country', async () => {
    const c1 = await RTCountry.create({ name: 'Country 1' });
    const c2 = await RTCountry.create({ name: 'Country 2' });

    const c1Id = c1._attributes.id as number;
    const c2Id = c2._attributes.id as number;

    const u1 = await RTUser.create({ name: 'User 1', country_id: c1Id });
    const u2 = await RTUser.create({ name: 'User 2', country_id: c2Id });

    await RTPost.create({ title: 'C1 Post 1', user_id: u1._attributes.id as number });
    await RTPost.create({ title: 'C1 Post 2', user_id: u1._attributes.id as number });
    await RTPost.create({ title: 'C2 Post 1', user_id: u2._attributes.id as number });

    Model.preventLazyLoading(true);
    try {
      const countries = await RTCountry.query().with('posts').get();
      expect(countries.length).toBe(2);

      for (const c of countries) {
        expect(c.relationLoaded('posts')).toBe(true);
      }

      const country1 = countries.toArray().find((c) => c._attributes.name === 'Country 1');
      const country2 = countries.toArray().find((c) => c._attributes.name === 'Country 2');

      expect(country1!.getRelation<any>('posts').length).toBe(2);
      expect(country2!.getRelation<any>('posts').length).toBe(1);
    } finally {
      Model.preventLazyLoading(false);
    }
  });

  it('RTCountry.withCount("posts").get() adds posts_count to each country', async () => {
    const c1 = await RTCountry.create({ name: 'Counted Country' });
    await RTCountry.create({ name: 'Zero Country' });

    const c1Id = c1._attributes.id as number;
    const u1 = await RTUser.create({ name: 'Counter User', country_id: c1Id });

    await RTPost.create({ title: 'Post X', user_id: u1._attributes.id as number });
    await RTPost.create({ title: 'Post Y', user_id: u1._attributes.id as number });

    const countries = await RTCountry.query().withCount('posts').get();
    expect(countries.length).toBe(2);

    // Every row should have a posts_count attribute
    for (const c of countries) {
      expect('posts_count' in (c as any)._attributes).toBe(true);
    }

    // The country with users/posts should have a non-zero count
    const arr = countries.toArray();
    const counts = arr.map((c) => Number((c as any)._attributes['posts_count']));
    expect(counts).toContain(2);
    expect(counts).toContain(0);
  });

  it('RTCountry.whereHas("posts").get() returns only countries with posts', async () => {
    const c1 = await RTCountry.create({ name: 'Has Posts' });
    const c2 = await RTCountry.create({ name: 'No Posts' });

    const c1Id = c1._attributes.id as number;
    const u1 = await RTUser.create({ name: 'Active User', country_id: c1Id });
    await RTPost.create({ title: 'Active Post', user_id: u1._attributes.id as number });

    const countries = await RTCountry.query().whereHas('posts').get();
    expect(countries.length).toBe(1);
    expect(countries.toArray()[0]._attributes.name).toBe('Has Posts');
  });

  it('RTCountry.doesntHave("posts").get() returns only countries without posts', async () => {
    const c1 = await RTCountry.create({ name: 'With Posts' });
    const c2 = await RTCountry.create({ name: 'Without Posts' });

    const c1Id = c1._attributes.id as number;
    const u1 = await RTUser.create({ name: 'Posting User', country_id: c1Id });
    await RTPost.create({ title: 'A Post', user_id: u1._attributes.id as number });

    const countries = await RTCountry.query().doesntHave('posts').get();
    expect(countries.length).toBe(1);
    expect(countries.toArray()[0]._attributes.name).toBe('Without Posts');
  });
});

// ── HasOneThrough ──────────────────────────────────────────────────────────

describe('HasOneThrough', () => {
  it('country.latestPost().getResults() returns one post when posts exist', async () => {
    const country = await RTCountry.create({ name: 'One Post Country' });
    const countryId = country._attributes.id as number;

    const user = await RTUser.create({ name: 'Solo User', country_id: countryId });
    await RTPost.create({ title: 'Only Post', user_id: user._attributes.id as number });

    const post = await country.latestPost().getResults();
    expect(post).not.toBeNull();
    expect((post as any)._attributes.title).toBe('Only Post');
  });

  it('country.latestPost().getResults() returns null when no posts exist', async () => {
    const country = await RTCountry.create({ name: 'Empty Through Country' });
    const post = await country.latestPost().getResults();
    expect(post).toBeNull();
  });

  it('country.latestPost().getResults() returns first post when multiple exist', async () => {
    const country = await RTCountry.create({ name: 'Multi Post Country' });
    const countryId = country._attributes.id as number;

    const user = await RTUser.create({ name: 'Multi User', country_id: countryId });
    const userId = user._attributes.id as number;

    await RTPost.create({ title: 'First Post', user_id: userId });
    await RTPost.create({ title: 'Second Post', user_id: userId });

    const post = await country.latestPost().getResults();
    expect(post).not.toBeNull();
    // HasOneThrough returns the first match (limit 1)
    expect((post as any)._attributes.title).toBe('First Post');
  });

  it('RTCountry.with("latestPost").get() eager loads latestPost for each country', async () => {
    const c1 = await RTCountry.create({ name: 'Post Country' });
    const c2 = await RTCountry.create({ name: 'Postless Country' });

    const c1Id = c1._attributes.id as number;
    const u1 = await RTUser.create({ name: 'User With Post', country_id: c1Id });
    await RTPost.create({ title: 'Eager Post', user_id: u1._attributes.id as number });

    Model.preventLazyLoading(true);
    try {
      const countries = await RTCountry.query().with('latestPost').get();
      expect(countries.length).toBe(2);

      for (const c of countries) {
        expect(c.relationLoaded('latestPost')).toBe(true);
      }

      const withPost = countries.toArray().find((c) => c._attributes.name === 'Post Country');
      const without = countries.toArray().find((c) => c._attributes.name === 'Postless Country');

      expect(withPost!.getRelation<any>('latestPost')).not.toBeNull();
      expect(without!.getRelation<any>('latestPost')).toBeNull();
    } finally {
      Model.preventLazyLoading(false);
    }
  });
});

// ── MorphToMany ────────────────────────────────────────────────────────────

describe('MorphToMany', () => {
  it('post.tags().attach(tagId) inserts a polymorphic pivot row', async () => {
    const post = await RTPost.create({ title: 'Attach Post', user_id: 0 });
    const tag = await RTTag.create({ name: 'attach-tag' });

    const postId = post._attributes.id as number;
    const tagId = tag._attributes.id as number;

    await post.tags().attach(tagId);

    const db = ConnectionManager.getConnection(CONN);
    const result = await db.query(
      'SELECT * FROM relthru_taggables WHERE taggable_id = ? AND taggable_type = ?',
      [postId, 'RTPost']
    );
    expect(result.rows.length).toBe(1);
    expect((result.rows[0] as any).tag_id).toBe(tagId);
  });

  it('post.tags().detach(tagId) removes a polymorphic pivot row', async () => {
    const post = await RTPost.create({ title: 'Detach Post', user_id: 0 });
    const tag = await RTTag.create({ name: 'detach-tag' });

    const postId = post._attributes.id as number;
    const tagId = tag._attributes.id as number;

    await post.tags().attach(tagId);
    await post.tags().detach(tagId);

    const db = ConnectionManager.getConnection(CONN);
    const result = await db.query(
      'SELECT * FROM relthru_taggables WHERE taggable_id = ? AND taggable_type = ?',
      [postId, 'RTPost']
    );
    expect(result.rows.length).toBe(0);
  });

  it('post.tags().sync([id1, id2]) syncs the pivot correctly', async () => {
    const post = await RTPost.create({ title: 'Sync Post', user_id: 0 });
    const tag1 = await RTTag.create({ name: 'sync-tag-1' });
    const tag2 = await RTTag.create({ name: 'sync-tag-2' });
    const tag3 = await RTTag.create({ name: 'sync-tag-3' });

    const tag1Id = tag1._attributes.id as number;
    const tag2Id = tag2._attributes.id as number;
    const tag3Id = tag3._attributes.id as number;

    // Attach tag1 and tag3 first
    await post.tags().attach([tag1Id, tag3Id]);

    // Sync to tag1 and tag2 (should attach tag2, detach tag3, keep tag1)
    const result = await post.tags().sync([tag1Id, tag2Id]);

    expect(result.attached).toContain(tag2Id);
    expect(result.detached).toContain(tag3Id);
    expect(result.attached).not.toContain(tag1Id);

    const tags = await post.tags().getResults();
    const names = [...tags].map((t) => (t as any)._attributes.name as string).sort();
    expect(names).toEqual(['sync-tag-1', 'sync-tag-2']);
  });

  it('post.tags().getResults() returns tags linked via pivot table', async () => {
    const post = await RTPost.create({ title: 'Tagged Post', user_id: 0 });
    const tag1 = await RTTag.create({ name: 'typescript' });
    const tag2 = await RTTag.create({ name: 'testing' });

    const postId = post._attributes.id as number;
    const tag1Id = tag1._attributes.id as number;
    const tag2Id = tag2._attributes.id as number;

    const db = ConnectionManager.getConnection(CONN);
    await db.query(
      'INSERT INTO relthru_taggables (tag_id, taggable_id, taggable_type) VALUES (?, ?, ?)',
      [tag1Id, postId, 'RTPost']
    );
    await db.query(
      'INSERT INTO relthru_taggables (tag_id, taggable_id, taggable_type) VALUES (?, ?, ?)',
      [tag2Id, postId, 'RTPost']
    );

    const tags = await post.tags().getResults();
    expect(tags.length).toBe(2);
    const names = [...tags].map((t) => (t as any)._attributes.name as string).sort();
    expect(names).toEqual(['testing', 'typescript']);
  });

  it('post.tags().getResults() returns empty when no tags linked', async () => {
    const post = await RTPost.create({ title: 'Untagged Post', user_id: 0 });
    const tags = await post.tags().getResults();
    expect(tags.length).toBe(0);
  });

  it('RTPost.with("tags").get() eager loads tags relation on each post', async () => {
    const post1 = await RTPost.create({ title: 'Tag Eager 1', user_id: 0 });
    const post2 = await RTPost.create({ title: 'Tag Eager 2', user_id: 0 });
    const tag1 = await RTTag.create({ name: 'node' });
    const tag2 = await RTTag.create({ name: 'orm' });

    const post1Id = post1._attributes.id as number;
    const post2Id = post2._attributes.id as number;
    const tag1Id = tag1._attributes.id as number;
    const tag2Id = tag2._attributes.id as number;

    const db = ConnectionManager.getConnection(CONN);
    await db.query(
      'INSERT INTO relthru_taggables (tag_id, taggable_id, taggable_type) VALUES (?, ?, ?)',
      [tag1Id, post1Id, 'RTPost']
    );
    await db.query(
      'INSERT INTO relthru_taggables (tag_id, taggable_id, taggable_type) VALUES (?, ?, ?)',
      [tag2Id, post1Id, 'RTPost']
    );
    await db.query(
      'INSERT INTO relthru_taggables (tag_id, taggable_id, taggable_type) VALUES (?, ?, ?)',
      [tag1Id, post2Id, 'RTPost']
    );

    Model.preventLazyLoading(true);
    try {
      const posts = await RTPost.query().with('tags').get();
      expect(posts.length).toBe(2);

      // Verify the relation is initialised on all posts (no lazy-load error thrown)
      for (const p of posts) {
        expect(p.relationLoaded('tags')).toBe(true);
        const tags = p.getRelation<any>('tags');
        expect(tags).toBeDefined();
        expect(typeof tags[Symbol.iterator]).toBe('function');
      }
    } finally {
      Model.preventLazyLoading(false);
    }
  });

  it('RTPost.withCount("tags").get() adds tags_count to each post', async () => {
    const post1 = await RTPost.create({ title: 'Two Tags Post', user_id: 0 });
    await RTPost.create({ title: 'Zero Tags Post', user_id: 0 });
    const tag1 = await RTTag.create({ name: 'count-tag-a' });
    const tag2 = await RTTag.create({ name: 'count-tag-b' });

    const post1Id = post1._attributes.id as number;
    const tag1Id = tag1._attributes.id as number;
    const tag2Id = tag2._attributes.id as number;

    const db = ConnectionManager.getConnection(CONN);
    await db.query(
      'INSERT INTO relthru_taggables (tag_id, taggable_id, taggable_type) VALUES (?, ?, ?)',
      [tag1Id, post1Id, 'RTPost']
    );
    await db.query(
      'INSERT INTO relthru_taggables (tag_id, taggable_id, taggable_type) VALUES (?, ?, ?)',
      [tag2Id, post1Id, 'RTPost']
    );

    const posts = await RTPost.query().withCount('tags').get();
    expect(posts.length).toBe(2);

    // Every row should have a tags_count attribute
    for (const p of posts) {
      expect('tags_count' in (p as any)._attributes).toBe(true);
    }

    // One post has 2 tags, one has 0
    const arr = posts.toArray();
    const counts = arr.map((p) => Number((p as any)._attributes['tags_count']));
    expect(counts).toContain(2);
    expect(counts).toContain(0);
  });

  it('RTPost.whereHas("tags").get() returns only posts that have tags', async () => {
    const post1 = await RTPost.create({ title: 'Has Tags', user_id: 0 });
    const post2 = await RTPost.create({ title: 'No Tags', user_id: 0 });
    const tag = await RTTag.create({ name: 'wh-tag' });

    const post1Id = post1._attributes.id as number;
    const tagId = tag._attributes.id as number;

    const db = ConnectionManager.getConnection(CONN);
    await db.query(
      'INSERT INTO relthru_taggables (tag_id, taggable_id, taggable_type) VALUES (?, ?, ?)',
      [tagId, post1Id, 'RTPost']
    );

    const posts = await RTPost.query().whereHas('tags').get();
    expect(posts.length).toBe(1);
    expect(posts.toArray()[0]._attributes.title).toBe('Has Tags');
  });

  it('post.tags().toggle() attaches and then detaches a tag', async () => {
    const post = await RTPost.create({ title: 'Toggle Post', user_id: 0 });
    const tag = await RTTag.create({ name: 'toggle-tag' });

    const tagId = tag._attributes.id as number;

    // Toggle on
    const r1 = await post.tags().toggle(tagId);
    expect(r1.attached).toContain(tagId);
    expect(r1.detached).toHaveLength(0);

    // Toggle off
    const r2 = await post.tags().toggle(tagId);
    expect(r2.detached).toContain(tagId);
    expect(r2.attached).toHaveLength(0);
  });
});

// ── MorphedByMany ──────────────────────────────────────────────────────────

describe('MorphedByMany', () => {
  it('tag.posts().getResults() returns posts linked to the tag via pivot', async () => {
    const post1 = await RTPost.create({ title: 'Post Alpha', user_id: 0 });
    const post2 = await RTPost.create({ title: 'Post Beta', user_id: 0 });
    const tag = await RTTag.create({ name: 'featured' });

    const post1Id = post1._attributes.id as number;
    const post2Id = post2._attributes.id as number;
    const tagId = tag._attributes.id as number;

    const db = ConnectionManager.getConnection(CONN);
    await db.query(
      'INSERT INTO relthru_taggables (tag_id, taggable_id, taggable_type) VALUES (?, ?, ?)',
      [tagId, post1Id, 'RTPost']
    );
    await db.query(
      'INSERT INTO relthru_taggables (tag_id, taggable_id, taggable_type) VALUES (?, ?, ?)',
      [tagId, post2Id, 'RTPost']
    );

    const posts = await tag.posts().getResults();
    expect(posts.length).toBe(2);
    const titles = [...posts].map((p) => (p as any)._attributes.title as string).sort();
    expect(titles).toEqual(['Post Alpha', 'Post Beta']);
  });

  it('tag.posts().getResults() returns empty when no posts linked', async () => {
    const tag = await RTTag.create({ name: 'unused' });
    const posts = await tag.posts().getResults();
    expect(posts.length).toBe(0);
  });

  it('tag.posts().getResults() scopes to the RTPost morph type only', async () => {
    const post = await RTPost.create({ title: 'Typed Post', user_id: 0 });
    const tag = await RTTag.create({ name: 'type-scoped' });

    const postId = post._attributes.id as number;
    const tagId = tag._attributes.id as number;

    const db = ConnectionManager.getConnection(CONN);
    await db.query(
      'INSERT INTO relthru_taggables (tag_id, taggable_id, taggable_type) VALUES (?, ?, ?)',
      [tagId, postId, 'RTPost']
    );
    // Insert a row with a different type that should be ignored
    await db.query(
      'INSERT INTO relthru_taggables (tag_id, taggable_id, taggable_type) VALUES (?, ?, ?)',
      [tagId, 999, 'OtherType']
    );

    const posts = await tag.posts().getResults();
    expect(posts.length).toBe(1);
    expect([...posts][0]._attributes.title).toBe('Typed Post');
  });

  it('RTTag.with("posts").get() eager loads posts relation on each tag', async () => {
    const tag1 = await RTTag.create({ name: 'Eager Tag 1' });
    const tag2 = await RTTag.create({ name: 'Eager Tag 2' });
    const post1 = await RTPost.create({ title: 'Tagged Post A', user_id: 0 });
    const post2 = await RTPost.create({ title: 'Tagged Post B', user_id: 0 });
    const post3 = await RTPost.create({ title: 'Tagged Post C', user_id: 0 });

    const tag1Id = tag1._attributes.id as number;
    const tag2Id = tag2._attributes.id as number;
    const post1Id = post1._attributes.id as number;
    const post2Id = post2._attributes.id as number;
    const post3Id = post3._attributes.id as number;

    const db = ConnectionManager.getConnection(CONN);
    // tag1 -> post1, post2
    await db.query(
      'INSERT INTO relthru_taggables (tag_id, taggable_id, taggable_type) VALUES (?, ?, ?)',
      [tag1Id, post1Id, 'RTPost']
    );
    await db.query(
      'INSERT INTO relthru_taggables (tag_id, taggable_id, taggable_type) VALUES (?, ?, ?)',
      [tag1Id, post2Id, 'RTPost']
    );
    // tag2 -> post3
    await db.query(
      'INSERT INTO relthru_taggables (tag_id, taggable_id, taggable_type) VALUES (?, ?, ?)',
      [tag2Id, post3Id, 'RTPost']
    );

    Model.preventLazyLoading(true);
    try {
      const tags = await RTTag.query().with('posts').get();
      expect(tags.length).toBe(2);

      // Verify the relation is initialised on all tags (no lazy-load error thrown)
      for (const t of tags) {
        expect(t.relationLoaded('posts')).toBe(true);
        const posts = t.getRelation<any>('posts');
        expect(posts).toBeDefined();
        expect(typeof posts[Symbol.iterator]).toBe('function');
      }
    } finally {
      Model.preventLazyLoading(false);
    }
  });

  it('tag.posts().attach() inserts pivot rows with correct morph type', async () => {
    const tag = await RTTag.create({ name: 'attach-inv-tag' });
    const post = await RTPost.create({ title: 'Attach Inv Post', user_id: 0 });

    const tagId = tag._attributes.id as number;
    const postId = post._attributes.id as number;

    await tag.posts().attach(postId);

    const db = ConnectionManager.getConnection(CONN);
    const result = await db.query(
      'SELECT * FROM relthru_taggables WHERE tag_id = ? AND taggable_id = ? AND taggable_type = ?',
      [tagId, postId, 'RTPost']
    );
    expect(result.rows.length).toBe(1);
  });

  it('tag.posts().sync([id1, id2]) syncs inverse pivot correctly', async () => {
    const tag = await RTTag.create({ name: 'sync-inv-tag' });
    const post1 = await RTPost.create({ title: 'Sync Inv Post 1', user_id: 0 });
    const post2 = await RTPost.create({ title: 'Sync Inv Post 2', user_id: 0 });
    const post3 = await RTPost.create({ title: 'Sync Inv Post 3', user_id: 0 });

    const post1Id = post1._attributes.id as number;
    const post2Id = post2._attributes.id as number;
    const post3Id = post3._attributes.id as number;

    await tag.posts().attach([post1Id, post3Id]);

    const result = await tag.posts().sync([post1Id, post2Id]);

    expect(result.attached).toContain(post2Id);
    expect(result.detached).toContain(post3Id);

    const posts = await tag.posts().getResults();
    expect(posts.length).toBe(2);
    const titles = [...posts].map((p) => (p as any)._attributes.title as string).sort();
    expect(titles).toEqual(['Sync Inv Post 1', 'Sync Inv Post 2']);
  });
});
