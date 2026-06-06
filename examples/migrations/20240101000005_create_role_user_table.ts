import { Migration, Blueprint } from '../../src';

// Pivot table for the User <-> Role many-to-many relationship.
// Convention: alphabetical order of the two model names → role_user
export default class CreateRoleUserTable extends Migration {
  async up(): Promise<void> {
    await this.Schema.create('role_user', (table: Blueprint) => {
      table.foreignId('user_id').references('id').on('users').onDelete('CASCADE');
      table.foreignId('role_id').references('id').on('roles').onDelete('CASCADE');
      table.timestamp('assigned_at').nullable();
      table.timestamp('expires_at').nullable();
      table.timestamps(); // pivot timestamps — enabled via .withTimestamps() on the relation
      table.primary(['user_id', 'role_id']); // composite PK prevents duplicates
    });
  }

  async down(): Promise<void> {
    await this.Schema.dropIfExists('role_user');
  }
}
