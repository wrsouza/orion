import { Migration, Blueprint } from '../../src';

export default class CreateProfilesTable extends Migration {
  async up(): Promise<void> {
    await this.Schema.create('profiles', (table: Blueprint) => {
      table.id();
      table.foreignId('user_id').references('id').on('users').onDelete('CASCADE').unique();
      table.string('avatar_url').nullable();
      table.string('website').nullable();
      table.string('twitter_handle', 50).nullable();
      table.text('bio').nullable();
      table.boolean('is_public').default(true);
      table.json('social_links').nullable();
      table.timestamps();
    });
  }

  async down(): Promise<void> {
    await this.Schema.dropIfExists('profiles');
  }
}
