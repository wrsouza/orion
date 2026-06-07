import { ConnectionManager } from '../../src/connection/ConnectionManager';
import { Schema } from '../../src/schema/Schema';
import { SQLiteSchemaGrammar } from '../../src/schema/grammars/SQLiteSchemaGrammar';
import { Model } from '../../src/model/Model';
import { table } from '../../src/model/decorators/table';
import { fillable } from '../../src/model/decorators/fillable';
import { HasOne } from '../../src/model/relations/HasOne';
import { BelongsTo } from '../../src/model/relations/BelongsTo';

// ── Model definitions ──────────────────────────────────────────────────────

const CONN = 'relone';

@table({ name: 'relone_users', timestamps: false, connection: CONN })
@fillable(['name'])
class RelUser extends Model {
  declare name: string;

  profile(): HasOne<RelProfile> {
    return this.hasOne(RelProfile, 'user_id', 'id');
  }

  phone(): HasOne<RelPhone> {
    return this.hasOne(RelPhone, 'user_id', 'id');
  }
}

@table({ name: 'relone_profiles', timestamps: false, connection: CONN })
@fillable(['bio', 'user_id'])
class RelProfile extends Model {
  declare bio: string;
  declare user_id: number;

  user(): BelongsTo<RelUser> {
    return this.belongsTo(RelUser, 'user_id', 'id');
  }
}

@table({ name: 'relone_phones', timestamps: false, connection: CONN })
@fillable(['number', 'user_id'])
class RelPhone extends Model {
  declare number: string;
  declare user_id: number;

  user(): BelongsTo<RelUser> {
    return this.belongsTo(RelUser, 'user_id', 'id');
  }
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeAll(async () => {
  ConnectionManager.addConnection(CONN, { driver: 'sqlite', filename: ':memory:' });
  Schema.useGrammar(new SQLiteSchemaGrammar());

  await Schema.create('relone_users', (t) => {
    t.id();
    t.string('name');
  }, CONN);

  await Schema.create('relone_profiles', (t) => {
    t.id();
    t.string('bio');
    t.integer('user_id').nullable();
  }, CONN);

  await Schema.create('relone_phones', (t) => {
    t.id();
    t.string('number');
    t.integer('user_id').nullable();
  }, CONN);
});

afterAll(async () => {
  await ConnectionManager.getConnection(CONN).disconnect();
});

beforeEach(async () => {
  const db = ConnectionManager.getConnection(CONN);
  await db.query('DELETE FROM relone_phones');
  await db.query('DELETE FROM relone_profiles');
  await db.query('DELETE FROM relone_users');
});

// ── HasOne tests ───────────────────────────────────────────────────────────

describe('hasOne — lazy load', () => {
  it('user.profile().getResults() returns the related profile', async () => {
    const user = await RelUser.create({ name: 'Alice' });
    await RelProfile.create({ bio: 'About Alice', user_id: user._attributes.id });

    const profile = await user.profile().getResults();
    expect(profile).not.toBeNull();
    expect((profile as any)._attributes.bio).toBe('About Alice');
  });

  it('user.profile().getResults() returns null when no profile exists', async () => {
    const user = await RelUser.create({ name: 'Bob' });

    const profile = await user.profile().getResults();
    expect(profile).toBeNull();
  });
});

describe('hasOne — write via relation', () => {
  it('user.profile().create() creates profile with FK set automatically', async () => {
    const user = await RelUser.create({ name: 'Carol' });

    const profile = await user.profile().create({ bio: 'Carol bio' });
    expect((profile as any)._attributes.user_id).toBe(user._attributes.id);
    expect((profile as any)._attributes.bio).toBe('Carol bio');
  });

  it('user.profile().save() saves an existing model with FK set', async () => {
    const user = await RelUser.create({ name: 'Dave' });
    const profile = await RelProfile.create({ bio: 'Dave bio', user_id: 0 });

    await user.profile().save(profile);

    expect((profile as any)._attributes.user_id).toBe(user._attributes.id);
    // Verify it was actually persisted
    const loaded = await user.profile().getResults();
    expect(loaded).not.toBeNull();
    expect((loaded as any)._attributes.bio).toBe('Dave bio');
  });

  it('user.profile().update() updates matched related records', async () => {
    const user = await RelUser.create({ name: 'Eve' });
    await RelProfile.create({ bio: 'Old bio', user_id: user._attributes.id });

    await user.profile().update({ bio: 'New bio' });

    const profile = await user.profile().getResults();
    expect((profile as any)._attributes.bio).toBe('New bio');
  });
});

// ── BelongsTo tests ────────────────────────────────────────────────────────

describe('belongsTo — lazy load', () => {
  it('profile.user().getResults() returns the correct parent user', async () => {
    const user = await RelUser.create({ name: 'Grace' });
    const profile = await RelProfile.create({ bio: 'Grace bio', user_id: user._attributes.id });

    const result = await profile.user().getResults();
    expect(result).not.toBeNull();
    expect((result as any)._attributes.id).toBe(user._attributes.id);
    expect((result as any)._attributes.name).toBe('Grace');
  });

  it('profile.user().getResults() returns null when FK is null', async () => {
    const db = ConnectionManager.getConnection(CONN);
    await db.query('INSERT INTO relone_profiles (bio, user_id) VALUES (?, ?)', ['no user', null]);
    const profiles = await RelProfile.query().orderBy('id', 'desc').limit(1).get();
    const profile = profiles.toArray()[0];

    const result = await profile.user().getResults();
    expect(result).toBeNull();
  });
});

describe('belongsTo — associate / dissociate', () => {
  it('profile.user().associate(user) sets the FK on profile', async () => {
    const user = await RelUser.create({ name: 'Henry' });
    const db = ConnectionManager.getConnection(CONN);
    await db.query('INSERT INTO relone_profiles (bio, user_id) VALUES (?, ?)', ['Henry bio', null]);
    const profiles = await RelProfile.query().orderBy('id', 'desc').limit(1).get();
    const profile = profiles.toArray()[0];

    profile.user().associate(user);
    await (profile as any).save();

    expect((profile as any)._attributes.user_id).toBe(user._attributes.id);

    const reloaded = await RelProfile.query().where('id', (profile as any)._attributes.id).first();
    expect((reloaded as any)._attributes.user_id).toBe(user._attributes.id);
  });

  it('profile.user().dissociate() sets FK to null on profile', async () => {
    const user = await RelUser.create({ name: 'Iris' });
    const profile = await RelProfile.create({ bio: 'Iris bio', user_id: user._attributes.id });

    profile.user().dissociate();
    await (profile as any).save();

    expect((profile as any)._attributes.user_id).toBeNull();

    const reloaded = await RelProfile.query().where('id', (profile as any)._attributes.id).first();
    expect((reloaded as any)._attributes.user_id).toBeNull();
  });
});

describe('belongsTo — withDefault', () => {
  it('withDefault() returns a default model instance when FK is null', async () => {
    const db = ConnectionManager.getConnection(CONN);
    await db.query('INSERT INTO relone_profiles (bio, user_id) VALUES (?, ?)', ['orphan', null]);
    const profiles = await RelProfile.query().orderBy('id', 'desc').limit(1).get();
    const profile = profiles.toArray()[0];

    const rel = profile.user().withDefault({ name: 'Guest' });
    const result = await rel.getResults();

    expect(result).not.toBeNull();
    expect((result as any)._attributes.name).toBe('Guest');
  });

  it('withDefault() returns the actual user when FK is set', async () => {
    const user = await RelUser.create({ name: 'Jack' });
    const profile = await RelProfile.create({ bio: 'Jack bio', user_id: user._attributes.id });

    const rel = profile.user().withDefault({ name: 'Guest' });
    const result = await rel.getResults();

    expect(result).not.toBeNull();
    expect((result as any)._attributes.name).toBe('Jack');
  });
});

// ── Eager loading ──────────────────────────────────────────────────────────

describe('eager loading with .with()', () => {
  it('RelUser.with("profile").get() loads profiles in a batch', async () => {
    const u1 = await RelUser.create({ name: 'Karen' });
    const u2 = await RelUser.create({ name: 'Leo' });
    await RelProfile.create({ bio: 'Karen bio', user_id: u1._attributes.id });
    // Leo has no profile

    Model.preventLazyLoading(true);
    try {
      const users = await RelUser.query().with('profile').get();
      expect(users.length).toBe(2);

      for (const u of users) {
        expect(u.relationLoaded('profile')).toBe(true);
      }

      const karen = users.toArray().find((u) => u._attributes.name === 'Karen');
      const leo = users.toArray().find((u) => u._attributes.name === 'Leo');

      expect(karen!.getRelation<any>('profile')).not.toBeNull();
      expect(leo!.getRelation<any>('profile')).toBeNull();
    } finally {
      Model.preventLazyLoading(false);
    }
  });

  it('RelUser.with("profile").get() limited to 1 loads profile for first result', async () => {
    const user = await RelUser.create({ name: 'Mia' });
    await RelProfile.create({ bio: 'Mia bio', user_id: user._attributes.id });

    Model.preventLazyLoading(true);
    try {
      const results = await RelUser.query().with('profile').where('name', 'Mia').get();
      expect(results.length).toBe(1);
      const result = results.toArray()[0];
      expect(result.relationLoaded('profile')).toBe(true);
      expect((result.getRelation<any>('profile') as any)._attributes.bio).toBe('Mia bio');
    } finally {
      Model.preventLazyLoading(false);
    }
  });

  it('RelProfile.with("user").get() eager-loads parent users', async () => {
    const user = await RelUser.create({ name: 'Ned' });
    await RelProfile.create({ bio: 'Ned bio', user_id: user._attributes.id });

    Model.preventLazyLoading(true);
    try {
      const profiles = await RelProfile.query().with('user').get();
      expect(profiles.length).toBe(1);
      expect(profiles.toArray()[0].relationLoaded('user')).toBe(true);
      expect((profiles.toArray()[0].getRelation<any>('user') as any)._attributes.name).toBe('Ned');
    } finally {
      Model.preventLazyLoading(false);
    }
  });
});

// ── whereHas / doesntHave ──────────────────────────────────────────────────

describe('whereHas / doesntHave', () => {
  it('RelUser.whereHas("profile").get() returns only users with a profile', async () => {
    const u1 = await RelUser.create({ name: 'Olivia' });
    const u2 = await RelUser.create({ name: 'Pete' });
    await RelProfile.create({ bio: 'Olivia bio', user_id: u1._attributes.id });

    const users = await RelUser.query().whereHas('profile').get();
    const names = users.toArray().map((u) => u._attributes.name as string);
    expect(names).toContain('Olivia');
    expect(names).not.toContain('Pete');
  });

  it('RelUser.doesntHave("profile").get() returns only users without a profile', async () => {
    const u1 = await RelUser.create({ name: 'Quinn' });
    const u2 = await RelUser.create({ name: 'Rose' });
    await RelProfile.create({ bio: 'Quinn bio', user_id: u1._attributes.id });

    const users = await RelUser.query().doesntHave('profile').get();
    const names = users.toArray().map((u) => u._attributes.name as string);
    expect(names).toContain('Rose');
    expect(names).not.toContain('Quinn');
  });

  it('RelUser.whereHas("profile") excludes users without a profile (reconfirm)', async () => {
    const u1 = await RelUser.create({ name: 'Sam' });
    const u2 = await RelUser.create({ name: 'Tina' });
    await RelProfile.create({ bio: 'developer', user_id: u1._attributes.id });
    // Tina has no profile

    const users = await RelUser.query().whereHas('profile').get();
    const names = users.toArray().map((u) => u._attributes.name as string);
    expect(names).toContain('Sam');
    expect(names).not.toContain('Tina');
  });

  it('RelProfile.whereHas("user") excludes orphan profiles', async () => {
    const u1 = await RelUser.create({ name: 'Alice' });
    await RelProfile.create({ bio: 'Alice profile', user_id: u1._attributes.id });
    // Insert orphan profile (no matching user)
    const db = ConnectionManager.getConnection(CONN);
    // Use a user_id that doesn't exist
    await db.query('INSERT INTO relone_profiles (bio, user_id) VALUES (?, ?)', ['orphan', 9999]);

    const profiles = await RelProfile.query().whereHas('user').get();
    const bios = profiles.toArray().map((p) => (p as any)._attributes.bio as string);
    expect(bios).toContain('Alice profile');
    expect(bios).not.toContain('orphan');
  });
});

// ── withCount ─────────────────────────────────────────────────────────────

describe('withCount', () => {
  it('RelUser.withCount("profile").get() attaches a profile_count attribute', async () => {
    const u1 = await RelUser.create({ name: 'Uma' });
    await RelProfile.create({ bio: 'Uma bio', user_id: u1._attributes.id });

    // withCount uses selectRaw which appends to the column list; start with explicit
    // select('*') so both the regular columns and the count subquery are returned.
    const users = await RelUser.query().select('*').withCount('profile').get();
    expect(users.length).toBeGreaterThanOrEqual(1);

    const uma = users.toArray().find((u) => (u as any)._attributes.name === 'Uma');
    expect(uma).not.toBeUndefined();
    expect(Number((uma as any)._attributes.profile_count)).toBe(1);
  });
});

// ── HasOne ofMany variants ─────────────────────────────────────────────────

describe('hasOne ofMany', () => {
  it('latestOfMany() returns the most recently inserted phone', async () => {
    const user = await RelUser.create({ name: 'Wendy' });
    await RelPhone.create({ number: '111', user_id: user._attributes.id });
    await RelPhone.create({ number: '222', user_id: user._attributes.id });

    const latest = await user.phone().latestOfMany('id').getResults();
    expect(latest).not.toBeNull();
    expect((latest as any)._attributes.number).toBe('222');
  });

  it('oldestOfMany() returns the first inserted phone', async () => {
    const user = await RelUser.create({ name: 'Xena' });
    await RelPhone.create({ number: '333', user_id: user._attributes.id });
    await RelPhone.create({ number: '444', user_id: user._attributes.id });

    const oldest = await user.phone().oldestOfMany('id').getResults();
    expect(oldest).not.toBeNull();
    expect((oldest as any)._attributes.number).toBe('333');
  });

  it('ofMany() with "max" returns the record with the highest value', async () => {
    const user = await RelUser.create({ name: 'Yara' });
    await RelPhone.create({ number: '555', user_id: user._attributes.id });
    await RelPhone.create({ number: '666', user_id: user._attributes.id });

    const result = await user.phone().ofMany('id', 'max').getResults();
    expect(result).not.toBeNull();
    expect((result as any)._attributes.number).toBe('666');
  });

  it('ofMany() with "min" returns the record with the lowest value', async () => {
    const user = await RelUser.create({ name: 'Zoe' });
    await RelPhone.create({ number: '777', user_id: user._attributes.id });
    await RelPhone.create({ number: '888', user_id: user._attributes.id });

    const result = await user.phone().ofMany('id', 'min').getResults();
    expect(result).not.toBeNull();
    expect((result as any)._attributes.number).toBe('777');
  });
});
