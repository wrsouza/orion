import {
  Model,
  table, fillable, casts,
  BelongsTo,
} from '../../src';
import type { User } from './User';

@table('profiles')
@fillable(['user_id', 'avatar_url', 'website', 'twitter_handle', 'bio', 'is_public'])
@casts({ is_public: 'boolean', social_links: 'json' })
export class Profile extends Model {
  declare id: number;
  declare user_id: number;
  declare avatar_url: string | null;
  declare website: string | null;
  declare twitter_handle: string | null;
  declare bio: string | null;
  declare is_public: boolean;
  declare social_links: Record<string, string> | null;
  declare created_at: Date;
  declare updated_at: Date;

  user(): BelongsTo<User> {
    return this.belongsTo(require('./User').User);
  }
}
