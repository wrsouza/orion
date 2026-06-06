import {
  Model,
  table, fillable, casts, hidden, appends, scopedBy,
  scope, accessor,
  SoftDeletes,
  Scope, ModelBuilder,
  BelongsTo, HasMany, MorphMany,
} from '../../src';
import type { User }    from './User';
import type { Comment } from './Comment';
import type { Tag }     from './Tag';

// ── Global scope: only published posts ───────────────────────────────────────

class PublishedScope implements Scope {
  apply(builder: ModelBuilder<any>): void {
    builder.where('status', 'published');
  }
}

// ── Model ─────────────────────────────────────────────────────────────────────

@table('posts')
@fillable(['user_id', 'title', 'slug', 'body', 'status', 'view_count'])
@casts({ published_at: 'date', view_count: 'number' })
@appends(['excerpt', 'reading_time_minutes'])
@scopedBy([PublishedScope])
export class Post extends SoftDeletes(Model) {
  declare id: number;
  declare user_id: number;
  declare title: string;
  declare slug: string;
  declare body: string | null;
  declare status: 'draft' | 'published' | 'archived';
  declare view_count: number;
  declare published_at: Date | null;
  declare deleted_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;

  // Touches the author's updated_at when post is modified
  protected _touches = ['author'];

  // ── Accessors ────────────────────────────────────────────────────────────────

  @accessor
  get excerpt(): string {
    const body = this._attributes.body as string ?? '';
    return body.slice(0, 160) + (body.length > 160 ? '…' : '');
  }

  @accessor
  get readingTimeMinutes(): number {
    const words = (this._attributes.body as string ?? '').split(/\s+/).length;
    return Math.ceil(words / 200); // ~200 wpm average reading speed
  }

  // ── Local scopes ─────────────────────────────────────────────────────────────

  @scope
  draft(builder: ModelBuilder<Post>): void {
    builder.where('status', 'draft');
  }

  @scope
  popular(builder: ModelBuilder<Post>, minViews = 1000): void {
    builder.where('view_count', '>=', minViews);
  }

  @scope
  recentlyPublished(builder: ModelBuilder<Post>): void {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000);
    builder.where('published_at', '>=', sevenDaysAgo);
  }

  // ── Relationships ────────────────────────────────────────────────────────────

  author(): BelongsTo<User> {
    return this.belongsTo(require('./User').User, 'user_id').withDefault({ name: 'Anonymous' });
  }

  comments(): HasMany<Comment> {
    return this.hasMany(require('./Comment').Comment).chaperone();
  }

  tags(): MorphMany<Tag> {
    return this.morphMany(require('./Tag').Tag, 'taggable');
  }
}
