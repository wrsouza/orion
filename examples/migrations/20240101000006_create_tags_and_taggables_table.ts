import { Migration, Blueprint } from '../../src';

// Tags + polymorphic pivot.
// A tag can be attached to any taggable model (Post, Video, etc.)
// via morphToMany / morphedByMany.
export default class CreateTagsAndTaggablesTable extends Migration {
  async up(): Promise<void> {
    await this.Schema.create('tags', (table: Blueprint) => {
      table.id();
      table.string('name', 50).unique();
      table.string('slug', 50).unique();
      table.timestamps();
    });

    await this.Schema.create('taggables', (table: Blueprint) => {
      table.foreignId('tag_id').references('id').on('tags').onDelete('CASCADE');
      table.bigInteger('taggable_id');
      table.string('taggable_type', 50);
      table.primary(['tag_id', 'taggable_id', 'taggable_type']);
      table.index(['taggable_type', 'taggable_id'], 'taggables_taggable_index');
    });
  }

  async down(): Promise<void> {
    await this.Schema.dropIfExists('taggables');
    await this.Schema.dropIfExists('tags');
  }
}
