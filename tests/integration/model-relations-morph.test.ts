import { ConnectionManager } from '../../src/connection/ConnectionManager';
import { Schema } from '../../src/schema/Schema';
import { SQLiteSchemaGrammar } from '../../src/schema/grammars/SQLiteSchemaGrammar';
import { Model } from '../../src/model/Model';
import { table } from '../../src/model/decorators/table';
import { fillable } from '../../src/model/decorators/fillable';
import { MorphOne } from '../../src/model/relations/MorphOne';
import { MorphMany } from '../../src/model/relations/MorphMany';
import { MorphTo } from '../../src/model/relations/MorphTo';
import { MorphToMany } from '../../src/model/relations/MorphToMany';
import { MorphedByMany } from '../../src/model/relations/MorphedByMany';
import { MorphMap } from '../../src/model/MorphMap';

// ── Model definitions ──────────────────────────────────────────────────────

@table({ name: 'morph_posts', timestamps: false, connection: 'morph' })
@fillable(['title'])
class MorphPost extends Model {
  declare title: string;

  comments(): MorphMany<MorphComment> {
    return this.morphMany(MorphComment, 'commentable');
  }

  latestComment(): MorphOne<MorphComment> {
    return this.morphOne(MorphComment, 'commentable');
  }

  tags(): MorphToMany<MorphTag> {
    return this.morphToMany(MorphTag, 'taggable', 'morph_taggables', 'tag_id', 'id', 'id');
  }
}

@table({ name: 'morph_videos', timestamps: false, connection: 'morph' })
@fillable(['title'])
class MorphVideo extends Model {
  declare title: string;

  comments(): MorphMany<MorphComment> {
    return this.morphMany(MorphComment, 'commentable');
  }
}

@table({ name: 'morph_comments', timestamps: false, connection: 'morph' })
@fillable(['body', 'commentable_id', 'commentable_type'])
class MorphComment extends Model {
  declare body: string;
  declare commentable_id: number;
  declare commentable_type: string;

  commentable(): MorphTo {
    return this.morphTo('commentable');
  }
}

@table({ name: 'morph_tags', timestamps: false, connection: 'morph' })
@fillable(['name'])
class MorphTag extends Model {
  declare name: string;

  posts(): MorphedByMany<MorphPost> {
    return this.morphedByMany(MorphPost, 'taggable', 'morph_taggables', 'tag_id', 'id', 'id');
  }
}

// ── Setup ──────────────────────────────────────────────────────────────────

const CONN = 'morph';

beforeAll(async () => {
  ConnectionManager.addConnection(CONN, { driver: 'sqlite', filename: ':memory:' });
  Schema.useGrammar(new SQLiteSchemaGrammar());

  await Schema.create('morph_posts', (t) => {
    t.id();
    t.string('title');
  }, CONN);

  await Schema.create('morph_videos', (t) => {
    t.id();
    t.string('title');
  }, CONN);

  await Schema.create('morph_comments', (t) => {
    t.id();
    t.string('body');
    t.integer('commentable_id');
    t.string('commentable_type');
  }, CONN);

  await Schema.create('morph_tags', (t) => {
    t.id();
    t.string('name');
  }, CONN);

  await Schema.create('morph_taggables', (t) => {
    t.integer('tag_id');
    t.integer('taggable_id');
    t.string('taggable_type');
  }, CONN);

  // Register morph map so type strings match class names
  MorphMap.enforce({
    MorphPost: MorphPost,
    MorphVideo: MorphVideo,
  });
});

afterAll(async () => {
  MorphMap.clear();
  await ConnectionManager.getConnection(CONN).disconnect();
});

beforeEach(async () => {
  const db = ConnectionManager.getConnection(CONN);
  await db.query('DELETE FROM morph_taggables', []);
  await db.query('DELETE FROM morph_comments', []);
  await db.query('DELETE FROM morph_tags', []);
  await db.query('DELETE FROM morph_videos', []);
  await db.query('DELETE FROM morph_posts', []);
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('MorphMany', () => {
  it('post.comments().getResults() returns only comments belonging to that post', async () => {
    const post = await MorphPost.create({ title: 'Post A' });
    const video = await MorphVideo.create({ title: 'Video A' });

    const postId = post._attributes.id as number;
    const videoId = video._attributes.id as number;

    await MorphComment.create({ body: 'Post comment 1', commentable_id: postId, commentable_type: 'MorphPost' });
    await MorphComment.create({ body: 'Post comment 2', commentable_id: postId, commentable_type: 'MorphPost' });
    await MorphComment.create({ body: 'Video comment', commentable_id: videoId, commentable_type: 'MorphVideo' });

    const comments = await post.comments().getResults();
    expect(comments.length).toBe(2);
    for (const c of comments) {
      expect((c as any)._attributes.commentable_type).toBe('MorphPost');
      expect((c as any)._attributes.commentable_id).toBe(postId);
    }
  });

  it('video.comments().getResults() returns only comments belonging to that video', async () => {
    const post = await MorphPost.create({ title: 'Post B' });
    const video = await MorphVideo.create({ title: 'Video B' });

    const postId = post._attributes.id as number;
    const videoId = video._attributes.id as number;

    await MorphComment.create({ body: 'Post comment', commentable_id: postId, commentable_type: 'MorphPost' });
    await MorphComment.create({ body: 'Video comment 1', commentable_id: videoId, commentable_type: 'MorphVideo' });
    await MorphComment.create({ body: 'Video comment 2', commentable_id: videoId, commentable_type: 'MorphVideo' });

    const comments = await video.comments().getResults();
    expect(comments.length).toBe(2);
    for (const c of comments) {
      expect((c as any)._attributes.commentable_type).toBe('MorphVideo');
      expect((c as any)._attributes.commentable_id).toBe(videoId);
    }
  });

  it('returns empty collection when no comments exist', async () => {
    const post = await MorphPost.create({ title: 'Empty Post' });
    const comments = await post.comments().getResults();
    expect(comments.length).toBe(0);
  });

  it('create() via relation sets type and id automatically', async () => {
    const post = await MorphPost.create({ title: 'Auto-fill Post' });
    await post.comments().create({ body: 'auto comment' });

    // Use a fresh relation instance to avoid stale query state
    const comments = await post.comments().getResults();
    expect(comments.length).toBeGreaterThan(0);
    const match = [...comments].find((c) => (c as any)._attributes.body === 'auto comment');
    expect(match).toBeDefined();
    expect((match as any)._attributes.commentable_type).toBe('MorphPost');
  });
});

describe('MorphOne', () => {
  it('post.latestComment().getResults() returns the single related comment', async () => {
    const post = await MorphPost.create({ title: 'Post One' });
    const postId = post._attributes.id as number;

    await MorphComment.create({ body: 'First comment', commentable_id: postId, commentable_type: 'MorphPost' });

    const comment = await post.latestComment().getResults();
    expect(comment).not.toBeNull();
    expect((comment as any)._attributes.body).toBe('First comment');
  });

  it('post.latestComment().getResults() returns null when no comments', async () => {
    const post = await MorphPost.create({ title: 'No Comments Post' });
    const comment = await post.latestComment().getResults();
    expect(comment).toBeNull();
  });

  it('post.latestComment().getResults() returns first when multiple exist', async () => {
    const post = await MorphPost.create({ title: 'Post First' });
    const postId = post._attributes.id as number;

    await MorphComment.create({ body: 'Alpha', commentable_id: postId, commentable_type: 'MorphPost' });
    await MorphComment.create({ body: 'Beta', commentable_id: postId, commentable_type: 'MorphPost' });

    const comment = await post.latestComment().getResults();
    expect(comment).not.toBeNull();
    // only the first is returned (MorphOne is a hasOne-style, returns first match)
    expect((comment as any)._attributes.body).toBe('Alpha');
  });
});

describe('MorphTo', () => {
  it('comment.commentable().getResults() resolves to the correct post', async () => {
    const post = await MorphPost.create({ title: 'Resolved Post' });
    const postId = post._attributes.id as number;

    const comment = await MorphComment.create({
      body: 'Hello',
      commentable_id: postId,
      commentable_type: 'MorphPost',
    });

    const owner = await comment.commentable().getResults();
    expect(owner).not.toBeNull();
    expect((owner as any)._attributes.id).toBe(postId);
    expect((owner as any)._attributes.title).toBe('Resolved Post');
  });

  it('comment.commentable().getResults() resolves to the correct video', async () => {
    const video = await MorphVideo.create({ title: 'Resolved Video' });
    const videoId = video._attributes.id as number;

    const comment = await MorphComment.create({
      body: 'Video note',
      commentable_id: videoId,
      commentable_type: 'MorphVideo',
    });

    const owner = await comment.commentable().getResults();
    expect(owner).not.toBeNull();
    expect((owner as any)._attributes.id).toBe(videoId);
    expect((owner as any)._attributes.title).toBe('Resolved Video');
  });

  it('comment.commentable().getResults() returns null when type not registered', async () => {
    const comment = await MorphComment.create({
      body: 'Orphan',
      commentable_id: 999,
      commentable_type: 'UnknownType',
    });

    const owner = await comment.commentable().getResults();
    expect(owner).toBeNull();
  });
});

describe('MorphToMany', () => {
  it('post.tags().getResults() returns tags linked via pivot table', async () => {
    const post = await MorphPost.create({ title: 'Tagged Post' });
    const tag1 = await MorphTag.create({ name: 'typescript' });
    const tag2 = await MorphTag.create({ name: 'testing' });

    const postId = post._attributes.id as number;
    const tag1Id = tag1._attributes.id as number;
    const tag2Id = tag2._attributes.id as number;

    const db = ConnectionManager.getConnection(CONN);
    await db.query(
      'INSERT INTO morph_taggables (tag_id, taggable_id, taggable_type) VALUES (?, ?, ?)',
      [tag1Id, postId, 'MorphPost']
    );
    await db.query(
      'INSERT INTO morph_taggables (tag_id, taggable_id, taggable_type) VALUES (?, ?, ?)',
      [tag2Id, postId, 'MorphPost']
    );

    const tags = await post.tags().getResults();
    expect(tags.length).toBe(2);
    const names = [...tags].map((t) => (t as any)._attributes.name as string).sort();
    expect(names).toEqual(['testing', 'typescript']);
  });

  it('post.tags().getResults() returns empty when no tags linked', async () => {
    const post = await MorphPost.create({ title: 'Untagged' });
    const tags = await post.tags().getResults();
    expect(tags.length).toBe(0);
  });

  it('post.tags().getResults() scopes to that post type only', async () => {
    const post = await MorphPost.create({ title: 'Post 1' });
    const video = await MorphVideo.create({ title: 'Video 1' });
    const tag = await MorphTag.create({ name: 'shared-tag' });

    const postId = post._attributes.id as number;
    const videoId = video._attributes.id as number;
    const tagId = tag._attributes.id as number;

    const db = ConnectionManager.getConnection(CONN);
    // Link tag to both post and video
    await db.query(
      'INSERT INTO morph_taggables (tag_id, taggable_id, taggable_type) VALUES (?, ?, ?)',
      [tagId, postId, 'MorphPost']
    );
    await db.query(
      'INSERT INTO morph_taggables (tag_id, taggable_id, taggable_type) VALUES (?, ?, ?)',
      [tagId, videoId, 'MorphVideo']
    );

    const postTags = await post.tags().getResults();
    // Should only return tags where taggable_type = 'MorphPost' AND taggable_id = postId
    expect(postTags.length).toBe(1);
    expect([...postTags][0]._attributes.name).toBe('shared-tag');
  });
});

describe('MorphedByMany', () => {
  it('tag.posts().getResults() returns posts linked to the tag via pivot', async () => {
    const post1 = await MorphPost.create({ title: 'Post Alpha' });
    const post2 = await MorphPost.create({ title: 'Post Beta' });
    const tag = await MorphTag.create({ name: 'featured' });

    const post1Id = post1._attributes.id as number;
    const post2Id = post2._attributes.id as number;
    const tagId = tag._attributes.id as number;

    const db = ConnectionManager.getConnection(CONN);
    await db.query(
      'INSERT INTO morph_taggables (tag_id, taggable_id, taggable_type) VALUES (?, ?, ?)',
      [tagId, post1Id, 'MorphPost']
    );
    await db.query(
      'INSERT INTO morph_taggables (tag_id, taggable_id, taggable_type) VALUES (?, ?, ?)',
      [tagId, post2Id, 'MorphPost']
    );

    const posts = await tag.posts().getResults();
    expect(posts.length).toBe(2);
    const titles = [...posts].map((p) => (p as any)._attributes.title as string).sort();
    expect(titles).toEqual(['Post Alpha', 'Post Beta']);
  });

  it('tag.posts().getResults() returns empty when no posts linked', async () => {
    const tag = await MorphTag.create({ name: 'unused' });
    const posts = await tag.posts().getResults();
    expect(posts.length).toBe(0);
  });

  it('tag.posts().getResults() scopes to that related morph type', async () => {
    const post = await MorphPost.create({ title: 'Typed Post' });
    const tag = await MorphTag.create({ name: 'type-scoped' });

    const postId = post._attributes.id as number;
    const tagId = tag._attributes.id as number;

    const db = ConnectionManager.getConnection(CONN);
    // Insert one row for MorphPost and one for a different type
    await db.query(
      'INSERT INTO morph_taggables (tag_id, taggable_id, taggable_type) VALUES (?, ?, ?)',
      [tagId, postId, 'MorphPost']
    );
    await db.query(
      'INSERT INTO morph_taggables (tag_id, taggable_id, taggable_type) VALUES (?, ?, ?)',
      [tagId, 999, 'MorphVideo']
    );

    const posts = await tag.posts().getResults();
    // Only MorphPost rows should match (relatedMorphClass = 'MorphPost')
    expect(posts.length).toBe(1);
    expect([...posts][0]._attributes.title).toBe('Typed Post');
  });
});

describe('eager loading with .with()', () => {
  it('MorphPost.with("comments").get() loads comments for each post', async () => {
    const post1 = await MorphPost.create({ title: 'Eager Post 1' });
    const post2 = await MorphPost.create({ title: 'Eager Post 2' });

    const post1Id = post1._attributes.id as number;
    const post2Id = post2._attributes.id as number;

    await MorphComment.create({ body: 'C1', commentable_id: post1Id, commentable_type: 'MorphPost' });
    await MorphComment.create({ body: 'C2', commentable_id: post1Id, commentable_type: 'MorphPost' });
    await MorphComment.create({ body: 'C3', commentable_id: post2Id, commentable_type: 'MorphPost' });

    Model.preventLazyLoading(true);
    try {
      const posts = await MorphPost.query().with('comments').get();
      expect(posts.length).toBe(2);

      for (const p of posts) {
        expect(p.relationLoaded('comments')).toBe(true);
      }

      const p1 = posts.toArray().find((p) => p._attributes.title === 'Eager Post 1');
      const p2 = posts.toArray().find((p) => p._attributes.title === 'Eager Post 2');

      expect(p1!.getRelation<any>('comments').length).toBe(2);
      expect(p2!.getRelation<any>('comments').length).toBe(1);
    } finally {
      Model.preventLazyLoading(false);
    }
  });

  it('MorphPost.with("latestComment").get() loads latestComment for each post', async () => {
    const post1 = await MorphPost.create({ title: 'One Comment Post' });
    const post2 = await MorphPost.create({ title: 'No Comment Post' });

    const post1Id = post1._attributes.id as number;

    await MorphComment.create({ body: 'Single', commentable_id: post1Id, commentable_type: 'MorphPost' });

    Model.preventLazyLoading(true);
    try {
      const posts = await MorphPost.query().with('latestComment').get();
      expect(posts.length).toBe(2);

      for (const p of posts) {
        expect(p.relationLoaded('latestComment')).toBe(true);
      }

      const p1 = posts.toArray().find((p) => p._attributes.title === 'One Comment Post');
      const p2 = posts.toArray().find((p) => p._attributes.title === 'No Comment Post');

      expect(p1!.getRelation<any>('latestComment')).not.toBeNull();
      expect(p2!.getRelation<any>('latestComment')).toBeNull();
    } finally {
      Model.preventLazyLoading(false);
    }
  });

  it('MorphPost.with("tags").get() initialises tags relation on each post', async () => {
    const post1 = await MorphPost.create({ title: 'Tag Eager 1' });
    const post2 = await MorphPost.create({ title: 'Tag Eager 2' });
    const tag1 = await MorphTag.create({ name: 'node' });
    const tag2 = await MorphTag.create({ name: 'orm' });

    const post1Id = post1._attributes.id as number;
    const post2Id = post2._attributes.id as number;
    const tag1Id = tag1._attributes.id as number;
    const tag2Id = tag2._attributes.id as number;

    const db = ConnectionManager.getConnection(CONN);
    await db.query(
      'INSERT INTO morph_taggables (tag_id, taggable_id, taggable_type) VALUES (?, ?, ?)',
      [tag1Id, post1Id, 'MorphPost']
    );
    await db.query(
      'INSERT INTO morph_taggables (tag_id, taggable_id, taggable_type) VALUES (?, ?, ?)',
      [tag2Id, post1Id, 'MorphPost']
    );
    await db.query(
      'INSERT INTO morph_taggables (tag_id, taggable_id, taggable_type) VALUES (?, ?, ?)',
      [tag1Id, post2Id, 'MorphPost']
    );

    Model.preventLazyLoading(true);
    try {
      const posts = await MorphPost.query().with('tags').get();
      expect(posts.length).toBe(2);

      // Verify the relation was initialised (no lazy-load error thrown)
      for (const p of posts) {
        expect(p.relationLoaded('tags')).toBe(true);
        // tags relation should be an iterable collection
        const tags = p.getRelation<any>('tags');
        expect(tags).toBeDefined();
        expect(typeof tags[Symbol.iterator]).toBe('function');
      }
    } finally {
      Model.preventLazyLoading(false);
    }
  });
});
