/**
 * 05 — Factories
 *
 * Demonstrates factory states, sequences, relationship factories,
 * hasAttached for M:M, recycle, and the trashed() state.
 */
import '../bootstrap';
import { Sequence } from '../../src';
import { User }    from '../models/User';
import { Post }    from '../models/Post';
import { Comment } from '../models/Comment';
import { Role }    from '../models/Role';
import { UserFactory }    from '../factories/UserFactory';
import { PostFactory }    from '../factories/PostFactory';
import { CommentFactory } from '../factories/CommentFactory';

// Register factories on models
User._factory    = UserFactory as any;
Post._factory    = PostFactory as any;
Comment._factory = CommentFactory as any;

async function main() {

  // ── Basic make / create ───────────────────────────────────────────────────────

  // make() — unsaved instance
  const draft = User.factory().make();
  console.log('make() id:', draft.id);              // undefined — not persisted
  console.log('make() name:', draft._attributes.name); // 'User 123'

  // create() — persisted instance
  const alice = await User.factory().state({ name: 'Alice', email: 'alice@example.com' }).create();
  console.log('create() id:', alice.id);             // 1 (auto-generated)
  console.log('wasRecentlyCreated:', alice.wasRecentlyCreated); // true

  // ── count ─────────────────────────────────────────────────────────────────────

  const users = await User.factory().count(5).create();
  console.log('created:', users.count(), 'users');

  // ── States ───────────────────────────────────────────────────────────────────

  const admin     = await User.factory().admin().create();
  const suspended = await User.factory().suspended().create();
  const unverified = User.factory().unverified().make();

  console.log('admin role:', admin.role);                      // 'admin'
  console.log('suspended active:', suspended.is_active);       // false
  console.log('unverified verified_at:', unverified._attributes.email_verified_at); // null

  // ── Sequences ─────────────────────────────────────────────────────────────────

  // Alternate between two states
  const mixed = await User.factory().count(4).state(new Sequence(
    { role: 'admin' },
    { role: 'editor' },
  )).create();
  console.log('roles:', mixed.pluck('role').all()); // ['admin', 'editor', 'admin', 'editor']

  // Sequence with $index
  const numbered = await Post.factory().count(3).state(new Sequence(
    (seq: Sequence) => ({ title: `Post #${seq.index + 1}` })
  )).create();
  console.log('titles:', numbered.pluck('title').all()); // ['Post #1', 'Post #2', 'Post #3']

  // ── afterCreating callback ────────────────────────────────────────────────────

  // UserFactory.configure() auto-creates a Profile for every user
  const userWithProfile = await User.factory().create();
  // Profile was created in afterCreating — no extra code needed here

  // ── has() — one-to-many relationship ─────────────────────────────────────────

  // Create a user with 3 posts
  const blogger = await User.factory()
    .has(Post.factory().count(3))
    .create();

  const blogPosts = await blogger.posts().get();
  console.log('blogger post count:', blogPosts.count()); // 3

  // State access to parent in child factory
  const author = await User.factory()
    .has(
      Post.factory().count(2).state((attrs: Record<string, unknown>, parent: User) => ({
        title: `${parent._attributes.name}'s Post`,
      }))
    )
    .create();

  // ── Magic has{Relation} shorthand ─────────────────────────────────────────────

  const powerUser = await (User.factory() as any).hasPosts(5).create();
  const powPosts  = await powerUser.posts().get();
  console.log('power user posts:', powPosts.count()); // 5

  // ── for() — belongs-to relationship ──────────────────────────────────────────

  // Create 3 posts belonging to a new user (FK user_id auto-set)
  const posts = await Post.factory().count(3)
    .for(User.factory().state({ name: 'Carol', email: 'carol@example.com' }))
    .create();

  console.log('all posts same user_id:', posts.pluck('user_id').unique().count() === 1); // true

  // ── hasAttached() — many-to-many with pivot ───────────────────────────────────

  let editorRole = await Role.withoutGlobalScopes().where('name', 'editor').first();
  if (!editorRole) editorRole = await Role.create({ name: 'editor' });

  const editor = await User.factory()
    .hasAttached(editorRole, { assigned_at: new Date() })
    .create();

  const roles = await editor.roles().get();
  console.log('editor has role:', roles[0]?._attributes?.name); // 'editor'

  // ── recycle() — reuse a shared related model ──────────────────────────────────

  const sharedAuthor = await User.factory().state({ name: 'Shared Author' }).create();

  // All 5 posts will reference the same sharedAuthor
  const recycled = await Post.factory()
    .count(5)
    .for(sharedAuthor)  // all posts get sharedAuthor as their user
    .create();

  const uniqueAuthors = recycled.pluck('user_id').unique();
  console.log('unique authors in recycled batch:', uniqueAuthors.count()); // 1

  // ── trashed() — soft-deleted state ───────────────────────────────────────────

  const deleted = await (Post.factory() as any).trashed().create();
  console.log('trashed post deleted_at:', deleted._attributes.deleted_at !== null); // true

  // ── createMany via sequence for seeding ──────────────────────────────────────

  // Useful for database seeding: create 50 posts with alternating status
  const seeded = await Post.factory().count(50)
    .state(new Sequence(
      { status: 'published', published_at: new Date() },
      { status: 'draft',     published_at: null },
    ))
    .create();

  const byStatus = seeded.groupBy('status');
  console.log('published:', byStatus['published']?.count() ?? 0);
  console.log('draft:    ', byStatus['draft']?.count()     ?? 0);
}

main().catch(console.error);
