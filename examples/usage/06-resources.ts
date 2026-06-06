/**
 * 06 — API Resources
 *
 * Demonstrates Resource, ResourceCollection, conditional fields,
 * whenLoaded, whenCounted, additional metadata, and response headers.
 */
import '../bootstrap';
import { Resource, ResourceCollection } from '../../src';
import { User }         from '../models/User';
import { Post }         from '../models/Post';
import { UserResource } from '../resources/UserResource';
import { PostResource } from '../resources/PostResource';

// ── Inline resource for this demo ─────────────────────────────────────────────

class PostSummaryResource extends Resource<Post> {
  toArray(): Record<string, unknown> {
    return {
      id:          this.resource.id,
      title:       this.resource.title,
      slug:        this.resource.slug,
      status:      this.resource.status,
      excerpt:     (this.resource as any).excerpt,
      view_count:  this.resource.view_count,
      published_at: this.resource.published_at,
    };
  }
}

// ── Custom ResourceCollection with pagination metadata ────────────────────────

class PostCollection extends ResourceCollection<Post> {
  $collects = PostSummaryResource;

  paginationInformation(paginated: any): Record<string, unknown> {
    return {
      meta: {
        total:        paginated.total,
        per_page:     paginated.perPage,
        current_page: paginated.currentPage,
        last_page:    paginated.lastPage,
        from:         paginated.from,
        to:           paginated.to,
      },
      links: {
        next: paginated.hasMorePages
          ? `/posts?page=${paginated.currentPage + 1}`
          : null,
        prev: paginated.currentPage > 1
          ? `/posts?page=${paginated.currentPage - 1}`
          : null,
      },
    };
  }
}

async function main() {

  // ── Single resource ────────────────────────────────────────────────────────────

  const user = await User.withoutGlobalScopes()
    .with('profile')
    .withCount('posts')
    .firstOrFail();

  const response = new UserResource(user).toResponse();
  console.log('single user response keys:', Object.keys(response));
  // { data: { id, name, email, ... }, api_version: 1 }

  const plain = new UserResource(user).resolve();
  console.log('resolve() (no data: wrapper):', Object.keys(plain));

  // ── whenLoaded — profile included only because we loaded it ──────────────────

  console.log('profile in response:', 'profile' in (response.data as any));
  // true — because we did .with('profile')

  const userNoProfile = await User.withoutGlobalScopes().firstOrFail();
  const noProfileResponse = new UserResource(userNoProfile).toResponse();
  console.log('profile absent when not loaded:', !('profile' in (noProfileResponse.data as any)));
  // true — profile key is omitted entirely

  // ── whenCounted — posts_count included only because we used withCount ─────────

  console.log('posts_count in response:', 'posts_count' in (response.data as any));
  // true — because we did .withCount('posts')

  // ── Collection resource ────────────────────────────────────────────────────────

  const posts = await Post.withoutGlobalScopes()
    .with('author', 'tags')
    .withCount('comments')
    .orderBy('created_at', 'desc')
    .limit(5)
    .get();

  const collectionResponse = PostResource.collection(posts).toResponse();
  console.log('collection count:', (collectionResponse.data as any[]).length);

  // ── additional() — merge top-level metadata at runtime ───────────────────────

  const withMeta = new UserResource(user)
    .additional({
      meta: {
        server:      'us-east-1',
        api_version: 2,
      },
    })
    .toResponse();

  console.log('meta.server:', (withMeta as any).meta?.server); // 'us-east-1'

  // ── withResponseHeaders ───────────────────────────────────────────────────────

  const httpResponse = new UserResource(user)
    .withResponseHeaders({
      'X-User-Id':     String(user.id),
      'Cache-Control': 'private, max-age=60',
    })
    .response();

  console.log('headers:', httpResponse.headers);
  // { 'X-User-Id': '1', 'Cache-Control': 'private, max-age=60' }

  // ── Resource.withoutWrapping() — disable the data: key globally ───────────────

  Resource.withoutWrapping();

  const unwrapped = new PostSummaryResource(posts[0]).toResponse();
  console.log('unwrapped keys:', Object.keys(unwrapped));
  // { id, title, slug, ... } — no 'data' wrapper

  // Re-enable wrapping (not normally needed — just for this demo)
  // Resource._withoutWrapping is private; in real apps you set this once at startup

  // ── Paginated collection resource ─────────────────────────────────────────────

  const page = await Post.withoutGlobalScopes()
    .orderBy('created_at', 'desc')
    .paginate(10, 1);

  const pageResponse = new PostCollection(page.data).toResponse();
  console.log('paginated response keys:', Object.keys(pageResponse));
  // { data: [...], meta: { total, per_page, ... }, links: { next, prev } }

  // ── Conditional merge — mergeWhen ─────────────────────────────────────────────

  class AdminAwareUserResource extends Resource<User> {
    isAdmin = (this.resource as any)._attributes?.role === 'admin';

    toArray(): Record<string, unknown> {
      return {
        id:   this.resource.id,
        name: this.resource.name,
        ...this.mergeWhen(this.isAdmin, {
          admin_since: this.resource.created_at,
          permissions: ['manage_users', 'manage_posts'],
        }),
      };
    }
  }

  const adminUser = await User.withoutGlobalScopes().where('role', 'admin').first();
  if (adminUser) {
    const adminResponse = new AdminAwareUserResource(adminUser).toResponse();
    console.log('admin resource has permissions:', 'permissions' in (adminResponse.data as any));
    // true
  }

  const viewerUser = await User.withoutGlobalScopes().where('role', 'viewer').first();
  if (viewerUser) {
    const viewerResponse = new AdminAwareUserResource(viewerUser).toResponse();
    console.log('viewer resource has permissions:', 'permissions' in (viewerResponse.data as any));
    // false — mergeWhen condition is false, keys are omitted
  }

  console.log('done');
}

main().catch(console.error);
