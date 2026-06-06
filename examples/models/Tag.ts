import {
  Model,
  table, fillable,
  MorphedByMany,
} from '../../src';
import type { Post } from './Post';

@table('tags')
@fillable(['name', 'slug'])
export class Tag extends Model {
  declare id: number;
  declare name: string;
  declare slug: string;
  declare created_at: Date;
  declare updated_at: Date;

  // Polymorphic inverse — Tag can be attached to any taggable model
  posts(): MorphedByMany<Post> {
    return this.morphedByMany(require('./Post').Post, 'taggable');
  }
}
