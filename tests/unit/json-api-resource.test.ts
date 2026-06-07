import { describe, it, expect, beforeEach } from 'vitest';
import {
  JsonApiResource,
  JsonApiCollectionResource,
  JsonApiDocument,
  JsonApiResourceObject,
} from '../../src/resources/JsonApiResource';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeModel(
  attrs: Record<string, unknown>,
  relations: Record<string, unknown> = {}
) {
  return { _attributes: attrs, id: attrs['id'], _relations: relations };
}

// ── Concrete resource classes used across tests ───────────────────────────────

class UserResource extends JsonApiResource<any> {
  $type = 'users';
  $attributes = ['name', 'email'];
}

class PostResource extends JsonApiResource<any> {
  $type = 'posts';
  $attributes = ['title'];
  $relationships = ['author'];
}

class FullUserResource extends JsonApiResource<any> {
  $type = 'users';

  toAttributes() {
    return { name: (this.resource as any)._attributes.name };
  }

  toLinks() {
    return { self: `/users/${(this.resource as any)._attributes.id}` };
  }

  toMeta() {
    return { version: 1 };
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('JsonApiResource', () => {
  // Reset global max depth before each test so tests are isolated
  beforeEach(() => {
    JsonApiResource.maxRelationshipDepth(3);
  });

  // ── Construction ──────────────────────────────────────────────────────────

  it('stores the resource on .resource', () => {
    const model = makeModel({ id: 1, name: 'Alice' });
    const r = new UserResource(model);
    expect(r.resource).toBe(model);
  });

  // ── toId ──────────────────────────────────────────────────────────────────

  it('toId() reads id from _attributes', () => {
    const r = new UserResource(makeModel({ id: 42, name: 'Alice' }));
    expect(r.toId()).toBe('42');
  });

  it('toId() falls back to resource.id', () => {
    const model = { id: 7 };
    const r = new UserResource(model);
    expect(r.toId()).toBe('7');
  });

  it('toId() returns empty string when no id', () => {
    const r = new UserResource({});
    expect(r.toId()).toBe('');
  });

  // ── toType ────────────────────────────────────────────────────────────────

  it('toType() returns $type', () => {
    const r = new UserResource(makeModel({ id: 1 }));
    expect(r.toType()).toBe('users');
  });

  // ── toAttributes ──────────────────────────────────────────────────────────

  it('toAttributes() picks $attributes from attributesToArray()', () => {
    const model = {
      ...makeModel({ id: 1, name: 'Alice', email: 'alice@example.com', secret: 'x' }),
      attributesToArray() {
        return this._attributes;
      },
    };
    const r = new UserResource(model);
    expect(r.toAttributes()).toEqual({ name: 'Alice', email: 'alice@example.com' });
    expect(r.toAttributes()).not.toHaveProperty('secret');
  });

  it('toAttributes() falls back to toArray() when attributesToArray missing', () => {
    const model = {
      ...makeModel({ id: 1, name: 'Bob', email: 'bob@example.com' }),
      toArray() {
        return this._attributes;
      },
    };
    const r = new UserResource(model);
    expect(r.toAttributes()).toEqual({ name: 'Bob', email: 'bob@example.com' });
  });

  it('toAttributes() returns only keys present in $attributes', () => {
    const model = {
      ...makeModel({ id: 1 }),
      attributesToArray() {
        return { id: 1, name: 'Dave' };
      },
    };
    const r = new UserResource(model); // $attributes = ['name','email']
    const attrs = r.toAttributes();
    expect(attrs).toHaveProperty('name', 'Dave');
    expect(attrs).not.toHaveProperty('id');
    expect(attrs).not.toHaveProperty('email'); // not in source
  });

  // ── toLinks / toMeta ──────────────────────────────────────────────────────

  it('toLinks() returns empty object by default', () => {
    const r = new UserResource(makeModel({ id: 1 }));
    expect(r.toLinks()).toEqual({});
  });

  it('toMeta() returns null by default', () => {
    const r = new UserResource(makeModel({ id: 1 }));
    expect(r.toMeta()).toBeNull();
  });

  // ── resolve ───────────────────────────────────────────────────────────────

  it('resolve() returns object with type and id', () => {
    const model = {
      ...makeModel({ id: 3 }),
      attributesToArray() { return {}; },
    };
    const r = new UserResource(model);
    const obj = r.resolve();
    expect(obj.type).toBe('users');
    expect(obj.id).toBe('3');
  });

  it('resolve() includes attributes when present', () => {
    const model = {
      ...makeModel({ id: 1 }),
      attributesToArray() { return { name: 'Eve', email: 'eve@example.com' }; },
    };
    const r = new UserResource(model);
    const obj = r.resolve();
    expect(obj.attributes).toEqual({ name: 'Eve', email: 'eve@example.com' });
  });

  it('resolve() omits attributes key when $attributes is empty', () => {
    const model = {
      ...makeModel({ id: 1 }),
      attributesToArray() { return { name: 'x' }; },
    };
    class EmptyResource extends JsonApiResource<any> {
      $type = 'empty';
      // $attributes defaults to []
    }
    const r = new EmptyResource(model);
    const obj = r.resolve();
    expect(obj).not.toHaveProperty('attributes');
  });

  it('resolve() applies sparse fieldset from request context', () => {
    const model = {
      ...makeModel({ id: 1 }),
      attributesToArray() { return { name: 'Frank', email: 'frank@example.com' }; },
    };
    const r = new UserResource(model);
    const obj = r.resolve({ fields: { users: ['name'] } });
    expect(obj.attributes).toEqual({ name: 'Frank' });
  });

  it('resolve() includes links when toLinks() returns non-empty', () => {
    const model = makeModel({ id: 5 });
    const r = new FullUserResource(model);
    const obj = r.resolve();
    expect(obj.links).toEqual({ self: '/users/5' });
  });

  it('resolve() includes meta when toMeta() returns non-null non-empty', () => {
    const model = makeModel({ id: 5 });
    const r = new FullUserResource(model);
    const obj = r.resolve();
    expect(obj.meta).toEqual({ version: 1 });
  });

  // ── toResponse ────────────────────────────────────────────────────────────

  it('toResponse() wraps data in a JsonApiDocument', () => {
    const model = {
      ...makeModel({ id: 1 }),
      attributesToArray() { return { name: 'Grace', email: 'grace@example.com' }; },
    };
    const r = new UserResource(model);
    const doc = r.toResponse();
    expect(doc).toHaveProperty('data');
    expect((doc.data as JsonApiResourceObject).type).toBe('users');
    expect((doc.data as JsonApiResourceObject).id).toBe('1');
  });

  it('toResponse() omits included when no relations loaded', () => {
    const model = {
      ...makeModel({ id: 1 }),
      attributesToArray() { return {}; },
    };
    const r = new UserResource(model);
    const doc = r.toResponse();
    expect(doc).not.toHaveProperty('included');
  });

  it('toResponse() forwards request context for sparse fieldsets', () => {
    const model = {
      ...makeModel({ id: 1 }),
      attributesToArray() { return { name: 'Nina', email: 'nina@example.com' }; },
    };
    const r = new UserResource(model);
    const doc = r.toResponse({ fields: { users: ['email'] } });
    const data = doc.data as JsonApiResourceObject;
    expect(data.attributes).toEqual({ email: 'nina@example.com' });
  });

  // ── Relationships ─────────────────────────────────────────────────────────

  it('toRelationships() skips relations not loaded in _relations', () => {
    const model = makeModel({ id: 1 }, {}); // no relations loaded
    const r = new PostResource(model);
    const rels = r.toRelationships();
    expect(rels).not.toHaveProperty('author');
  });

  it('toRelationships() returns null data for null relation', () => {
    const model = makeModel({ id: 1 }, { author: null });
    const r = new PostResource(model);
    const rels = r.toRelationships();
    expect(rels.author).toEqual({ data: null });
  });

  it('toRelationships() returns identifier for single related model with _attributes', () => {
    class AuthorModel {
      _attributes = { id: 10, name: 'Henry' };
    }
    const author = new AuthorModel();
    const model = makeModel({ id: 1 }, { author });
    const r = new PostResource(model);
    const rels = r.toRelationships();
    expect(rels.author.data).toMatchObject({ id: '10' });
    expect((rels.author.data as any).type).toMatch(/author/);
  });

  it('toRelationships() returns array identifiers for hasMany relations', () => {
    class TagModel {
      _attributes = { id: 20, name: 'ts' };
    }
    const tag = new TagModel();

    class TaggedPostResource extends JsonApiResource<any> {
      $type = 'posts';
      $relationships = ['tags'];
    }
    const model = makeModel({ id: 1 }, { tags: [tag] });
    const r = new TaggedPostResource(model);
    const rels = r.toRelationships();
    expect(Array.isArray(rels.tags.data)).toBe(true);
    expect((rels.tags.data as any[])[0]).toMatchObject({ id: '20' });
  });

  // ── included ──────────────────────────────────────────────────────────────

  it('toResponse() collects included for loaded relationships', () => {
    class AuthorModel {
      _attributes = { id: 99, name: 'Iris' };
    }
    const author = new AuthorModel();
    const model = makeModel({ id: 1 }, { author });

    class ArticleResource extends JsonApiResource<any> {
      $type = 'articles';
      $relationships = ['author'];
    }

    const doc = new ArticleResource(model).toResponse();
    expect(doc.included).toBeDefined();
    expect(doc.included!.length).toBe(1);
    expect(doc.included![0].id).toBe('99');
  });

  it('toResponse() deduplicates included resources across multiple relations', () => {
    class CommentModel {
      _attributes = { id: 55, body: 'hi' };
    }
    const comment = new CommentModel();

    class PostWithDupResource extends JsonApiResource<any> {
      $type = 'posts';
      $relationships = ['comment_a', 'comment_b'];
    }
    const model = makeModel({ id: 1 }, { comment_a: [comment], comment_b: [comment] });
    const doc = new PostWithDupResource(model).toResponse();
    // Same comment referenced twice — should appear once
    expect(doc.included!.filter((i) => i.id === '55').length).toBe(1);
  });

  // ── ignoreFieldsAndIncludesInQueryString ──────────────────────────────────

  it('ignoreFieldsAndIncludesInQueryString() makes resolve() ignore sparse fieldsets', () => {
    const model = {
      ...makeModel({ id: 1 }),
      attributesToArray() { return { name: 'Jack', email: 'jack@example.com' }; },
    };
    const r = new UserResource(model);
    r.ignoreFieldsAndIncludesInQueryString();
    const obj = r.resolve({ fields: { users: ['name'] } });
    // Both fields should appear because query string is ignored
    expect(obj.attributes).toHaveProperty('name');
    expect(obj.attributes).toHaveProperty('email');
  });

  it('ignoreFieldsAndIncludesInQueryString() returns this for chaining', () => {
    const r = new UserResource(makeModel({ id: 1 }));
    expect(r.ignoreFieldsAndIncludesInQueryString()).toBe(r);
  });

  // ── includePreviouslyLoadedRelationships ──────────────────────────────────

  it('includePreviouslyLoadedRelationships() returns this for chaining', () => {
    const r = new UserResource(makeModel({ id: 1 }));
    expect(r.includePreviouslyLoadedRelationships()).toBe(r);
  });

  it('includePreviouslyLoadedRelationships() adds all _relations to included', () => {
    class TagModel {
      _attributes = { id: 5, label: 'ts' };
    }
    const tag = new TagModel();
    const model = makeModel({ id: 1 }, { tags: [tag] });

    class ArticleResource extends JsonApiResource<any> {
      $type = 'articles';
      // $relationships intentionally empty — tags are only in _relations
    }

    const r = new ArticleResource(model);
    r.includePreviouslyLoadedRelationships();
    const doc = r.toResponse();
    expect(doc.included).toBeDefined();
    expect(doc.included!.some((i) => i.id === '5')).toBe(true);
  });

  // ── Static make ───────────────────────────────────────────────────────────

  it('static make() returns a new instance wrapping the model', () => {
    const model = makeModel({ id: 1 });
    const r = UserResource.make(model);
    expect(r).toBeInstanceOf(UserResource);
    expect(r.resource).toBe(model);
  });

  // ── Static jsonApiCollection ──────────────────────────────────────────────

  it('jsonApiCollection() returns a JsonApiCollectionResource', () => {
    const models = [makeModel({ id: 1 }), makeModel({ id: 2 })];
    const col = UserResource.jsonApiCollection(models);
    expect(col).toBeInstanceOf(JsonApiCollectionResource);
  });

  it('jsonApiCollection().toResponse() returns data array with correct length', () => {
    const make = (id: number) => ({
      ...makeModel({ id }),
      attributesToArray() { return { name: `User${id}`, email: `u${id}@example.com` }; },
    });
    const doc = UserResource.jsonApiCollection([make(1), make(2)]).toResponse();
    expect(Array.isArray(doc.data)).toBe(true);
    expect((doc.data as JsonApiResourceObject[]).length).toBe(2);
  });

  it('jsonApiCollection() accepts an iterable (Set)', () => {
    const model = {
      ...makeModel({ id: 1 }),
      attributesToArray() { return {}; },
    };
    const set = new Set([model]);
    const col = UserResource.jsonApiCollection(set);
    const doc = col.toResponse();
    expect((doc.data as JsonApiResourceObject[]).length).toBe(1);
  });

  // ── JsonApiCollectionResource.meta / links ────────────────────────────────

  it('collection.meta() adds top-level meta to the document', () => {
    const model = {
      ...makeModel({ id: 1 }),
      attributesToArray() { return {}; },
    };
    const doc = UserResource.jsonApiCollection([model])
      .meta({ total: 1 })
      .toResponse();
    expect(doc.meta).toEqual({ total: 1 });
  });

  it('collection.links() adds top-level links to the document', () => {
    const model = {
      ...makeModel({ id: 1 }),
      attributesToArray() { return {}; },
    };
    const doc = UserResource.jsonApiCollection([model])
      .links({ self: '/users', next: '/users?page=2' })
      .toResponse();
    expect(doc.links).toEqual({ self: '/users', next: '/users?page=2' });
  });

  it('collection.toJSON() delegates to toResponse()', () => {
    const model = {
      ...makeModel({ id: 1 }),
      attributesToArray() { return {}; },
    };
    const col = UserResource.jsonApiCollection([model]);
    expect(col.toJSON()).toEqual(col.toResponse());
  });

  it('collection omits included when no relations are loaded', () => {
    const model = {
      ...makeModel({ id: 1 }),
      attributesToArray() { return {}; },
    };
    const doc = UserResource.jsonApiCollection([model]).toResponse();
    expect(doc).not.toHaveProperty('included');
  });

  it('collection omits meta and links keys when not set', () => {
    const model = {
      ...makeModel({ id: 1 }),
      attributesToArray() { return {}; },
    };
    const doc = UserResource.jsonApiCollection([model]).toResponse();
    expect(doc).not.toHaveProperty('meta');
    expect(doc).not.toHaveProperty('links');
  });

  // ── maxRelationshipDepth ──────────────────────────────────────────────────

  it('maxRelationshipDepth(0) prevents any included from being collected', () => {
    JsonApiResource.maxRelationshipDepth(0);

    class NodeModel {
      _attributes = { id: 1, value: 'root' };
      _relations = {};
    }
    const node = new NodeModel();
    const model = makeModel({ id: 1 }, { node });

    class NodeResource extends JsonApiResource<any> {
      $type = 'nodes';
      $relationships = ['node'];
    }

    const doc = new NodeResource(model).toResponse();
    expect(doc).not.toHaveProperty('included');
  });

  // ── include via request context ───────────────────────────────────────────

  it('toResponse() includes relation when listed in request context include', () => {
    class CommentModel {
      _attributes = { id: 77, body: 'Nice!' };
    }
    const comment = new CommentModel();
    const model = makeModel({ id: 1 }, { comments: [comment] });

    class PostRes extends JsonApiResource<any> {
      $type = 'posts';
      // $relationships empty — rely on include in request ctx
    }

    const doc = new PostRes(model).toResponse({ include: ['comments'] });
    expect(doc.included).toBeDefined();
    expect(doc.included!.some((i) => i.id === '77')).toBe(true);
  });
});
