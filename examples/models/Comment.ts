import {
  Model,
  table, fillable, casts, scopedBy,
  scope,
  Scope, ModelBuilder,
  BelongsTo, MorphTo,
} from '../../src';
import type { User } from './User';
import type { Post } from './Post';

// ── Global scope: only approved comments ─────────────────────────────────────

class ApprovedScope implements Scope {
  apply(builder: ModelBuilder<any>): void {
    builder.where('approved', true);
  }
}

// ── Model ─────────────────────────────────────────────────────────────────────

@table('comments')
@fillable(['user_id', 'commentable_id', 'commentable_type', 'body', 'approved'])
@casts({ approved: 'boolean' })
@scopedBy([ApprovedScope])
export class Comment extends Model {
  declare id: number;
  declare user_id: number;
  declare commentable_id: number;
  declare commentable_type: string;   // 'post', 'video', etc. (uses MorphMap)
  declare body: string;
  declare approved: boolean;
  declare created_at: Date;
  declare updated_at: Date;

  // ── Local scope ──────────────────────────────────────────────────────────────

  @scope
  recent(builder: ModelBuilder<Comment>): void {
    builder.orderBy('created_at', 'desc').limit(10);
  }

  // ── Relationships ─────────────────────────────────────────────────────────────

  author(): BelongsTo<User> {
    return this.belongsTo(require('./User').User, 'user_id');
  }

  // Polymorphic inverse — resolves to Post, Video, etc.
  commentable(): MorphTo {
    return this.morphTo('commentable');
  }

  // Convenience: typed access when you know the parent is a post
  post(): BelongsTo<Post> {
    return this.belongsTo(require('./Post').Post, 'commentable_id');
  }
}
