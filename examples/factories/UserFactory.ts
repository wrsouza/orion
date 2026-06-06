import { Factory, Sequence } from '../../../src';
import { User } from '../models/User';
import { Profile } from '../models/Profile';

export class UserFactory extends Factory<User> {
  model = User;

  definition(): Record<string, unknown> {
    // Using static data here — swap in @faker-js/faker in a real project:
    //   import { faker } from '@faker-js/faker';
    //   name: faker.person.fullName(),
    //   email: faker.internet.email(),
    const idx = Math.floor(Math.random() * 1000);
    return {
      name:               `User ${idx}`,
      email:              `user${idx}@example.com`,
      password:           'secret',
      is_active:          true,
      role:               'viewer',
      email_verified_at:  new Date(),
      score:              0,
    };
  }

  // ── States ───────────────────────────────────────────────────────────────────

  admin(): this {
    return this.state({ role: 'admin', is_active: true });
  }

  editor(): this {
    return this.state({ role: 'editor' });
  }

  unverified(): this {
    return this.state({ email_verified_at: null });
  }

  suspended(): this {
    return this.state({ is_active: false });
  }

  withHighScore(score = 500): this {
    return this.state({ score });
  }

  // ── Callbacks ─────────────────────────────────────────────────────────────────

  protected configure(): void {
    this.afterCreating(async (user) => {
      // Automatically create a profile for every new user
      await Profile.create({ user_id: user.id, is_public: true });
    });
  }
}
