import { Migration, Blueprint } from '../../src';

export default class CreatePostsTable extends Migration {
  async up(): Promise<void> {
    await this.Schema.create('posts', (table: Blueprint) => {
      table.id();
      table.foreignId('user_id');
      table.string('title');
      table.string('slug', 255).unique();
      table.text('body').nullable();
      table.enum('status', ['draft', 'published', 'archived']).default('draft');
      table.timestamp('published_at').nullable();
      table.timestamps();
      table.softDeletes();

      table.foreign('user_id').references('id').on('users').onDelete('CASCADE');
      table.index('status');
    });
  }

  async down(): Promise<void> {
    await this.Schema.dropIfExists('posts');
  }
}
