/**
 * 02 — Relationships
 *
 * Demonstrates eager loading, relationship querying, pivot operations,
 * aggregate loading, writing via relationships, and polymorphic relations.
 */
import '../bootstrap';
import { withoutEvents } from '../../src';
import { User }    from '../models/User';
import { Post }    from '../models/Post';
import { Comment } from '../models/Comment';
import { Role }    from '../models/Role';
import { Tag }     from '../models/Tag';

async function main() {

  // ── Setup ────────────────────────────────────────────────────────────────────

  const user = await User.withoutGlobalScopes().firstOrFail();
  const post = await Post.withoutGlobalScopes().firstOrFail();

  // ── Eager loading ─────────────────────────────────────────────────────────────

  // Single relation
  const users = await User.withoutGlobalScopes().with('posts').limit(5).get();

  // Multiple relations
  const usersWithRoles = await User.withoutGlobalScopes()
    .with(['profile', 'roles'])
    .limit(5)
    .get();

  // Nested relations
  const postsWithAuthors = await Post.withoutGlobalScopes()
    .with('author.profile')
    .limit(5)
    .get();

  // Constrained eager load — only approved comments
  const postsWithApproved = await Post.withoutGlobalScopes()
    .with({
      comments: (q) => q.withoutGlobalScopes().where('approved', true).orderBy('created_at', 'desc'),
    })
    .limit(5)
    .get();

  console.log('posts with comments:', postsWithApproved.count());
  for (const p of postsWithApproved) {
    const comments = p.getRelation<any>('comments');
    console.log(`  post "${p._attributes.title}" — ${comments?.count() ?? 0} approved comments`);
  }

  // ── Relationship existence ────────────────────────────────────────────────────

  // Posts that have at least one comment
  const commented = await Post.withoutGlobalScopes().has('comments').get();

  // Posts with 3 or more approved comments
  const popular = await Post.withoutGlobalScopes()
    .whereHas('comments', (q) => q.withoutGlobalScopes().where('approved', true), '>=', 3)
    .get();

  // Posts without any tags
  const untagged = await Post.withoutGlobalScopes().doesntHave('tags').get();

  // Users with at least one published post OR with role 'admin'
  const activeContributors = await User
    .whereHas('posts')
    .orWhere('role', 'admin')
    .get();

  console.log(`commented=${commented.count()} popular=${popular.count()} untagged=${untagged.count()}`);

  // ── whereBelongsTo ────────────────────────────────────────────────────────────

  // All posts by this user — without hardcoding user_id
  const userPosts = await Post.withoutGlobalScopes().whereBelongsTo(user, 'author').get();
  console.log('posts by user:', userPosts.count());

  // ── Relationship aggregates ───────────────────────────────────────────────────

  const postsWithCounts = await Post.withoutGlobalScopes()
    .withCount('comments')
    .withSum('comments as approved_count', 'approved') // sum of boolean = count of approved
    .orderBy('comments_count', 'desc')
    .limit(10)
    .get();

  for (const p of postsWithCounts) {
    const count = p.getRelation<number>('comments_count') ?? 0;
    console.log(`  "${p._attributes.title}" — ${count} comments`);
  }

  // Load aggregates on instances
  await user.loadCount('posts');
  await user.loadSum('posts', 'view_count');
  console.log('posts count:', user.getRelation<number>('posts_count'));
  console.log('total views:', user.getRelation<number>('posts_sum_view_count'));

  // Load aggregates on a collection
  const topUsers = await User.withoutGlobalScopes().limit(5).get();
  await topUsers.loadCount('posts');
  for (const u of topUsers) {
    console.log(`${u._attributes.name}: ${u.getRelation<number>('posts_count')} posts`);
  }

  // ── Pivot operations (BelongsToMany) ─────────────────────────────────────────

  let adminRole = await Role.withoutGlobalScopes().where('name', 'admin').first();
  if (!adminRole) {
    adminRole = await Role.create({ name: 'admin', description: 'Administrator' });
  }
  let editorRole = await Role.withoutGlobalScopes().where('name', 'editor').first();
  if (!editorRole) {
    editorRole = await Role.create({ name: 'editor', description: 'Content editor' });
  }

  // Attach a role with extra pivot data
  await user.roles().attach(adminRole.id, {
    assigned_at: new Date(),
  });

  // Sync — detaches roles not in the list, attaches missing ones
  await user.roles().sync([adminRole.id, editorRole.id]);

  // Sync without detaching (additive only)
  await user.roles().syncWithoutDetaching([adminRole.id]);

  // Access pivot data on loaded roles
  const roles = await user.roles().get();
  for (const role of roles) {
    const membership = role.getRelation<any>('membership');
    console.log(`role=${role._attributes.name} assigned_at=${membership?.get('assigned_at')}`);
  }

  // Update pivot row
  await user.roles().updateExistingPivot(adminRole.id, { assigned_at: new Date() });

  // Detach a specific role
  await user.roles().detach(editorRole.id);

  // ── Writing via relationships ─────────────────────────────────────────────────

  // Create a related model — FK (user_id) is auto-set
  const newPost = await user.posts().create({
    title:  'My First Post',
    slug:   'my-first-post',
    body:   'Hello from a related create!',
    status: 'draft',
  });
  console.log('new post user_id:', newPost._attributes.user_id, '===', user.id);

  // Create multiple comments at once
  await newPost.comments().createMany([
    { body: 'First comment!',  approved: true,  user_id: user.id },
    { body: 'Second comment.', approved: false, user_id: user.id },
  ]);

  // firstOrCreate within a relation
  const pinned = await newPost.comments().firstOrCreate(
    { body: 'Pinned comment' },
    { approved: true, user_id: user.id },
  );
  console.log('pinned.wasRecentlyCreated:', pinned.wasRecentlyCreated);

  // ── Polymorphic — morphMany tags ──────────────────────────────────────────────

  let tsTag = await Tag.withoutGlobalScopes().where('slug', 'typescript').first();
  if (!tsTag) {
    tsTag = await Tag.create({ name: 'TypeScript', slug: 'typescript' });
  }

  // Attach a tag to a post (morphToMany)
  await newPost.tags().attach(tsTag.id);

  // Load posts with their tags
  const taggedPosts = await Post.withoutGlobalScopes()
    .with('tags')
    .whereHas('tags', (q) => q.withoutGlobalScopes().where('slug', 'typescript'))
    .get();

  console.log('posts tagged with typescript:', taggedPosts.count());

  // ── Polymorphic — morphTo (commentable) ──────────────────────────────────────

  // Query comments attached to any Post
  const postComments = await Comment.withoutGlobalScopes()
    .whereHasMorph('commentable', [Post])
    .limit(5)
    .get();

  for (const comment of postComments) {
    const parent = await comment.commentable().getResults();
    console.log(`comment on post: ${(parent as any)?._attributes?.title}`);
  }

  // ── Lazy loading guard demo ───────────────────────────────────────────────────

  // Accessing a non-loaded relation throws LazyLoadingViolationError in dev
  // const bare = await User.withoutGlobalScopes().find(1);
  // bare!.posts(); // would throw: "Attempted to lazy load [posts] on [User]..."
  // Use User.with('posts').find(1) instead.

  console.log('done');
}

main().catch(console.error);
