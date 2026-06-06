import { Migration, Blueprint } from '../../src';

export default class CreateRolesTable extends Migration {
  async up(): Promise<void> {
    await this.Schema.create('roles', (table: Blueprint) => {
      table.id();
      table.string('name', 50).unique();
      table.string('description').nullable();
      table.timestamps();
    });
  }

  async down(): Promise<void> {
    await this.Schema.dropIfExists('roles');
  }
}
