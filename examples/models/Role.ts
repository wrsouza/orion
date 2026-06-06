import {
  Model,
  table, fillable,
  BelongsToMany,
} from '../../src';
import type { User } from './User';

@table('roles')
@fillable(['name', 'description'])
export class Role extends Model {
  declare id: number;
  declare name: string;
  declare description: string | null;
  declare created_at: Date;
  declare updated_at: Date;

  users(): BelongsToMany<User> {
    return this.belongsToMany(require('./User').User)
      .withPivot('assigned_at', 'expires_at')
      .withTimestamps()
      .as('membership');
  }
}
