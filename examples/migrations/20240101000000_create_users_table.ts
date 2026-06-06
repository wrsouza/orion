import { Migration, Blueprint } from '../../src';

export default class CreateUsersTable extends Migration {
  async up(): Promise<void> {
    await this.Schema.create('users', (table: Blueprint) => {
      table.id();
      table.string('name');
      table.string('email', 255).unique();
      table.string('password');
      table.boolean('is_active').default(true);
      table.timestamp('email_verified_at').nullable();
      table.jsonb('settings').nullable();
      table.timestamps();
    });
  }

  async down(): Promise<void> {
    await this.Schema.dropIfExists('users');
  }
}
