import { Schema } from '../schema/Schema';
import { Blueprint } from '../schema/Blueprint';

/**
 * Base class for all migration files.
 *
 * Subclasses must implement `up()` (apply the migration) and `down()` (revert it).
 * The `Schema` and `Blueprint` helpers are pre-imported and available as
 * instance properties so migration files stay concise.
 *
 * @example
 * ```ts
 * export default class CreateUsersTable extends Migration {
 *   async up() {
 *     await this.Schema.create('users', (table) => {
 *       table.id();
 *       table.string('email').unique();
 *       table.timestamps();
 *     });
 *   }
 *
 *   async down() {
 *     await this.Schema.dropIfExists('users');
 *   }
 * }
 * ```
 */
export abstract class Migration {
  protected Schema = Schema;
  protected Blueprint = Blueprint;

  abstract up(): Promise<void>;
  abstract down(): Promise<void>;
}
