/**
 * 03 — Scopes & Events
 *
 * Demonstrates global scopes, local scopes, lifecycle events,
 * observers, and quiet/without-events operations.
 */
import '../bootstrap';
import { withoutEvents, Model } from '../../src';
import { User } from '../models/User';
import { Post } from '../models/Post';

async function main() {

  // ── Global scopes ─────────────────────────────────────────────────────────────

  // ActiveScope is registered via @scopedBy on User — every query has WHERE is_active = true.
  const active = await User.all();
  console.log('all() applies ActiveScope:', active.count(), 'active users');

  // Opt out of the global scope for a single query
  const everyone = await User.withoutGlobalScopes().get();
  console.log('withoutGlobalScopes():', everyone.count(), 'total users');

  // Remove a specific scope by name
  const noActive = await User.withoutGlobalScope('ActiveScope').get();
  console.log('withoutGlobalScope(ActiveScope):', noActive.count());

  // PublishedScope on Post
  const published = await Post.all();
  console.log('published posts:', published.count());

  const allPosts = await Post.withoutGlobalScopes().get();
  console.log('all posts (any status):', allPosts.count());

  // ── Local scopes ──────────────────────────────────────────────────────────────

  // Local scopes are called on the query builder proxy
  const builder = User.query() as any;

  const admins   = await builder.admin().get();
  const verified = await User.query() as any;
  const vip      = await (User.query() as any).withHighScore(200).get();

  // Chain multiple scopes
  const topAdmins = await (User.query() as any).admin().verified().orderBy('score', 'desc').get();
  console.log('top admins:', topAdmins.count());

  // ── Runtime event hooks ───────────────────────────────────────────────────────

  // Register a one-off hook (useful for tests or scripts)
  User.created((user) => {
    console.log(`[event] User created: id=${user.id} email=${user._attributes.email}`);
  });

  User.saving((user) => {
    // Ensure role is always lowercase
    if (typeof user._attributes.role === 'string') {
      user._attributes.role = (user._attributes.role as string).toLowerCase() as any;
    }
  });

  // Cancellable event — return false to abort
  User.deleting((user) => {
    if (user._attributes.role === 'admin') {
      console.log(`[event] Blocked: cannot delete admin user ${user.id}`);
      return false;
    }
  });

  // ── Create — events fire automatically ───────────────────────────────────────

  const charlie = await User.create({
    name:      'Charlie',
    email:     'charlie@example.com',
    password:  'secret',
    is_active: true,
    role:      'EDITOR', // saving hook will lowercase this
  });
  console.log('charlie.role:', charlie.role); // 'editor'

  // ── Update — saving + updated fire ───────────────────────────────────────────

  charlie.score = 42;
  await charlie.save();
  console.log('charlie updated, wasChanged:', charlie.wasChanged('score'));

  // ── Delete — blocked for admin, allowed for others ───────────────────────────

  const result = await charlie.delete();
  console.log('delete result (non-admin):', result); // true

  // Attempt to delete an admin (blocked by deleting hook)
  const adminUser = await User.withoutGlobalScopes().where('role', 'admin').first();
  if (adminUser) {
    const blocked = await adminUser.delete();
    console.log('delete admin blocked:', !blocked); // true
  }

  // ── Quiet operations — no events ─────────────────────────────────────────────

  const dave = await User.create({
    name: 'Dave', email: 'dave@example.com', password: 'x', is_active: true, role: 'viewer',
  });

  // Save without firing saving/saved events
  dave.bio = 'Updated bio';
  await dave.saveQuietly();
  console.log('dave saved quietly — no events fired');

  // Delete without firing deleting/deleted events
  await dave.deleteQuietly();
  console.log('dave deleted quietly');

  // ── withoutEvents — suppress all events in a block ───────────────────────────

  await withoutEvents(async () => {
    // None of these fire creating/created/deleting/deleted
    const eve = await User.create({
      name: 'Eve', email: 'eve@example.com', password: 'x', is_active: true, role: 'viewer',
    });
    await eve.delete();
    console.log('withoutEvents block finished — no events fired for eve');
  });

  // Events re-enabled after the block
  console.log('events re-enabled');

  // ── Post scopes ───────────────────────────────────────────────────────────────

  const draftPosts = await (Post.query() as any).draft().orderBy('created_at', 'desc').limit(5).get();
  console.log('draft posts:', draftPosts.count());

  const popularPosts = await (Post.query() as any).withoutGlobalScopes().popular(500).get();
  console.log('posts with 500+ views:', popularPosts.count());
}

main().catch(console.error);
