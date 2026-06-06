/**
 * 01 — Querying
 *
 * Demonstrates the fluent query builder: filters, ordering, aggregates,
 * pagination, chunking, and raw expressions.
 */
import '../bootstrap';
import { raw } from '../../src';
import { User } from '../models/User';
import { Post } from '../models/Post';

async function main() {

  // ── Basic retrieval ──────────────────────────────────────────────────────────

  const all   = await User.withoutGlobalScopes().all();   // ignore ActiveScope
  const user  = await User.find(1);                       // null if not found
  const user2 = await User.findOrFail(1);                 // throws if not found
  const first = await User.where('email', 'alice@example.com').first();
  console.log('total users:', all.count());

  // ── Fluent filters ────────────────────────────────────────────────────────────

  const actives = await User
    .where('is_active', true)
    .where('score', '>=', 50)
    .orderBy('name')
    .limit(10)
    .get();

  const adminsOrEditors = await User
    .withoutGlobalScopes()
    .where('role', 'admin')
    .orWhere('role', 'editor')
    .get();

  // Logical grouping — produces: WHERE is_active = true AND (role = 'admin' OR score > 100)
  const featured = await User
    .where('is_active', true)
    .where((q) => {
      q.where('role', 'admin').orWhere('score', '>', 100);
    })
    .get();

  // ── whereIn / whereNotIn ──────────────────────────────────────────────────────

  const selected = await User.whereIn('id', [1, 2, 3]).get();
  const excluded = await User.whereNotIn('role', ['admin']).get();

  // ── whereNull / whereBetween ──────────────────────────────────────────────────

  const unverified = await User.withoutGlobalScopes().whereNull('email_verified_at').get();
  const midRange   = await User.whereBetween('score', [50, 200]).get();

  // ── Aggregates ───────────────────────────────────────────────────────────────

  const count   = await User.withoutGlobalScopes().count();
  const maxScore = await User.max('score');
  const avgScore = await User.avg('score');
  const hasAdmin = await User.withoutGlobalScopes().where('role', 'admin').exists();

  console.log(`count=${count} max=${maxScore} avg=${avgScore} hasAdmin=${hasAdmin}`);

  // ── firstOrCreate / updateOrCreate ───────────────────────────────────────────

  const alice = await User.withoutGlobalScopes().firstOrCreate(
    { email: 'alice@example.com' },
    { name: 'Alice', password: 'secret', is_active: true, role: 'editor' },
  );
  console.log('alice.wasRecentlyCreated:', alice.wasRecentlyCreated);

  const bob = await User.withoutGlobalScopes().updateOrCreate(
    { email: 'bob@example.com' },
    { name: 'Bob Updated', is_active: true, role: 'viewer', password: 'secret' },
  );

  // ── Pagination ────────────────────────────────────────────────────────────────

  const page = await Post.withoutGlobalScopes()
    .orderBy('created_at', 'desc')
    .paginate(10);

  console.log(`page 1/${page.lastPage} — showing ${page.from}–${page.to} of ${page.total}`);
  console.log('hasMore:', page.hasMorePages);

  // Simple paginator — no COUNT query
  const feed = await Post.withoutGlobalScopes().latest().simplePaginate(20);
  console.log('feed hasMore:', feed.hasMorePages);

  // ── Chunking for large datasets ───────────────────────────────────────────────

  let processed = 0;
  await User.withoutGlobalScopes().chunkById(100, async (users) => {
    processed += users.count();
    // await sendNewsletter(users);
  });
  console.log('processed via chunk:', processed);

  // ── Cursor iteration (one row at a time, minimal memory) ─────────────────────

  let printed = 0;
  for await (const user of User.withoutGlobalScopes().where('role', 'admin').cursor()) {
    console.log('admin:', user._attributes.name);
    if (++printed >= 5) break;
  }

  // ── Raw expressions ───────────────────────────────────────────────────────────

  const stats = await User.withoutGlobalScopes()
    .select('role')
    .selectRaw('COUNT(*) as total')
    .selectRaw('AVG(score) as avg_score')
    .groupBy('role')
    .orderByRaw('COUNT(*) DESC')
    .get();

  for (const row of stats) {
    console.log(`role=${row._attributes.role} total=${row._attributes.total} avg=${row._attributes.avg_score}`);
  }

  // Subquery in where
  const topPosters = await User
    .whereExists((q) => {
      q.from('posts')
       .whereColumn('posts.user_id', 'users.id')
       .where('posts.status', 'published')
       .groupBy('posts.user_id')
       .havingRaw('COUNT(*) >= ?', [5]);
    })
    .get();

  console.log('top posters:', topPosters.count());
}

main().catch(console.error);
