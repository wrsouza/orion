import {
  Model,
  table, fillable, hidden, casts, appends, scopedBy, observedBy,
  scope, accessor, mutator,
  SoftDeletes, HasUuids,
  Scope, ModelBuilder, Observer,
  HasOne, HasMany, BelongsToMany,
  UseResource,
} from '../../src';
import type { Post }    from './Post';
import type { Profile } from './Profile';
import type { Role }    from './Role';

// ── Global scope: only active users ──────────────────────────────────────────

class ActiveScope implements Scope {
  apply(builder: ModelBuilder<any>): void {
    builder.where('is_active', true);
  }
}

// ── Observer ──────────────────────────────────────────────────────────────────

class UserObserver implements Observer<User> {
  saving(user: User): void {
    // Normalize email before every save
    if (typeof user._attributes.email === 'string') {
      user._attributes.email = user._attributes.email.toLowerCase().trim();
    }
  }

  created(user: User): void {
    console.log(`[UserObserver] User created: ${user.id} — ${user._attributes.email}`);
  }

  deleting(user: User): void | false {
    // Prevent deletion of the last admin
    if (user._attributes.role === 'admin') {
      console.warn(`[UserObserver] Blocked deletion of admin user ${user.id}`);
      return false;
    }
  }
}

// ── Model ─────────────────────────────────────────────────────────────────────

@table('users')
@fillable(['name', 'email', 'password', 'is_active', 'role', 'bio'])
@hidden(['password'])
@casts({
  is_active:          'boolean',
  settings:           'json',
  email_verified_at:  'date',
  score:              'decimal:2',
})
@appends(['full_name'])
@scopedBy([ActiveScope])
@observedBy([UserObserver])
export class User extends SoftDeletes(Model) {
  declare id: number;
  declare name: string;
  declare email: string;
  declare password: string;
  declare is_active: boolean;
  declare role: 'admin' | 'editor' | 'viewer';
  declare bio: string | null;
  declare score: number;
  declare settings: Record<string, unknown> | null;
  declare email_verified_at: Date | null;
  declare deleted_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;

  // Default attribute values
  protected _defaults = {
    role:      'viewer' as const,
    is_active: true,
    score:     0,
  };

  // ── Accessor ────────────────────────────────────────────────────────────────

  @accessor
  get fullName(): string {
    const first = this._attributes.first_name as string ?? '';
    const last  = this._attributes.last_name  as string ?? '';
    return `${first} ${last}`.trim() || (this._attributes.name as string);
  }

  // ── Mutator ─────────────────────────────────────────────────────────────────

  @mutator
  set password(value: string) {
    // In production, use bcrypt. Here we just prefix for illustration.
    this._attributes.password = `hashed:${value}`;
  }

  // ── Local scopes ─────────────────────────────────────────────────────────────

  @scope
  admin(builder: ModelBuilder<User>): void {
    builder.where('role', 'admin');
  }

  @scope
  verified(builder: ModelBuilder<User>): void {
    builder.whereNotNull('email_verified_at');
  }

  @scope
  withHighScore(builder: ModelBuilder<User>, threshold = 100): void {
    builder.where('score', '>=', threshold);
  }

  // ── Relationships ────────────────────────────────────────────────────────────

  profile(): HasOne<Profile> {
    return this.hasOne(require('./Profile').Profile);
  }

  posts(): HasMany<Post> {
    return this.hasMany(require('./Post').Post);
  }

  latestPost(): HasOne<Post> {
    return (this.hasOne(require('./Post').Post) as any).latestOfMany();
  }

  roles(): BelongsToMany<Role> {
    return this.belongsToMany(require('./Role').Role)
      .withPivot('assigned_at', 'expires_at')
      .withTimestamps()
      .as('membership');
  }
}
