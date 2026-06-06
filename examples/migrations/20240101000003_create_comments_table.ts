import { Migration, Blueprint } from '../../src';

export default class CreateCommentsTable extends Migration {
  async up(): Promise<void> {
    await this.Schema.create('comments', (table: Blueprint) => {
      table.id();
      table.foreignId('user_id').references('id').on('users').onDelete('CASCADE');
      // Polymorphic columns
      table.bigInteger('commentable_id').index();
      table.string('commentable_type', 50).index();
      table.text('body');
      table.boolean('approved').default(false);
      table.timestamps();
      table.index(['commentable_type', 'commentable_id'], 'comments_commentable_index');
    });
  }

  async down(): Promise<void> {
    await this.Schema.dropIfExists('comments');
  }
}
