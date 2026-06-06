/**
 * 04 — Serialization
 *
 * Demonstrates toArray(), toJSON(), hidden/visible attributes,
 * appended accessors, and per-instance visibility overrides.
 */
import '../bootstrap';
import { User } from '../models/User';
import { Post } from '../models/Post';

async function main() {

  const user = await User.withoutGlobalScopes()
    .with('profile', 'posts')
    .firstOrFail();

  // ── Basic serialization ───────────────────────────────────────────────────────

  const plain = user.toArray();
  // - 'password' is excluded (@hidden)
  // - loaded relations (profile, posts) are included recursively
  // - 'full_name' accessor is included (@appends)
  console.log('toArray keys:', Object.keys(plain));

  const attrsOnly = user.attributesToArray();
  // - only own column values, no relations
  console.log('attributesToArray has posts?', 'posts' in attrsOnly); // false

  const json = JSON.stringify(user);
  // - same as toArray() but as a JSON string
  // - can be returned directly from an HTTP handler
  console.log('JSON length:', json.length);

  // ── @hidden — password is always excluded ─────────────────────────────────────

  console.log('password in toArray:', 'password' in plain);       // false
  console.log('password raw attr:', user._attributes.password);   // accessible directly

  // ── @visible — only listed fields appear ─────────────────────────────────────

  // To demonstrate @visible, we'd need a model that uses it.
  // User uses @hidden, so let's show setVisible() instead:
  const minimal = user.setVisible(['id', 'name', 'email']).toArray();
  console.log('setVisible keys:', Object.keys(minimal)); // ['id', 'name', 'email']

  // ── makeVisible / makeHidden ──────────────────────────────────────────────────

  // Temporarily expose a hidden column
  const withPassword = user.makeVisible('password').toArray();
  console.log('after makeVisible — has password:', 'password' in withPassword); // true

  // Temporarily hide a visible column
  const withoutEmail = user.makeHidden('email').toArray();
  console.log('after makeHidden — has email:', 'email' in withoutEmail); // false

  // ── setHidden — replace the entire hidden list ────────────────────────────────

  const withJustId = user.setHidden(['name', 'email', 'score', 'role', 'bio',
    'settings', 'email_verified_at', 'created_at', 'updated_at', 'deleted_at']).toArray();
  console.log('setHidden leaves:', Object.keys(withJustId));

  // ── mergeVisible / mergeHidden ────────────────────────────────────────────────

  const withBio = user.mergeVisible(['bio']).toArray();
  console.log('after mergeVisible — has bio:', 'bio' in withBio); // true

  // ── @appends — computed accessors in output ───────────────────────────────────

  // full_name is in @appends, so it appears in toArray() automatically
  console.log('full_name:', plain.full_name);

  // ── append / setAppends / withoutAppends at runtime ──────────────────────────

  const noAppends = user.withoutAppends().toArray();
  console.log('withoutAppends — has full_name:', 'full_name' in noAppends); // false

  const customAppends = user.setAppends(['full_name']).toArray();
  console.log('setAppends — full_name:', customAppends.full_name);

  // ── Serialize a collection ────────────────────────────────────────────────────

  const users = await User.withoutGlobalScopes().limit(5).get();

  // toArray() on a collection returns T[] each going through toArray()
  const arr = users.toArray();
  console.log('collection serialized:', arr.length, 'users');

  // Apply visibility override to all models in the collection at once
  const safe = users.makeHidden(['email']).toArray();
  console.log('collection — has email?', 'email' in (safe[0] ?? {})); // false

  // ── Serializing relations recursively ────────────────────────────────────────

  const userWithPosts = await User.withoutGlobalScopes()
    .with('posts')
    .firstOrFail();

  const data = userWithPosts.toArray();
  // data.posts is an array of plain objects — each post's @appends are included too
  const posts = data.posts as any[];
  if (posts?.length) {
    console.log('first post excerpt:', posts[0].excerpt);
  }

  // ── Date serialization ────────────────────────────────────────────────────────

  const post = await Post.withoutGlobalScopes().firstOrFail();
  const postData = post.toArray();
  // published_at is cast to 'date', so it's serialized as an ISO string
  console.log('published_at type:', typeof postData.published_at); // string or null
}

main().catch(console.error);
