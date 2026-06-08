/**
 * Base class for all seed files.
 *
 * Subclasses implement `run()` to insert data.
 * Use `this.call([OtherSeeder])` to run seeders in sequence.
 *
 * @example
 * ```ts
 * // DatabaseSeeder.ts
 * import { Seeder } from '@wrsouza/orion';
 * import { UserSeeder } from './UserSeeder';
 * import { PostSeeder } from './PostSeeder';
 *
 * export default class DatabaseSeeder extends Seeder {
 *   async run(): Promise<void> {
 *     await this.call([UserSeeder, PostSeeder]);
 *   }
 * }
 *
 * // UserSeeder.ts
 * import { Seeder } from '@wrsouza/orion';
 * import { UserFactory } from '../factories/UserFactory';
 *
 * export default class UserSeeder extends Seeder {
 *   async run(): Promise<void> {
 *     await new UserFactory().count(10).create();
 *   }
 * }
 * ```
 */
export abstract class Seeder {
  abstract run(): Promise<void>;

  /**
   * Run a list of seeder classes in sequence.
   * Each seeder is instantiated and its `run()` method is called.
   *
   * @example
   * ```ts
   * await this.call([UserSeeder, PostSeeder]);
   * ```
   */
  protected async call(seeders: (new () => Seeder)[]): Promise<void> {
    for (const SeederClass of seeders) {
      await new SeederClass().run();
    }
  }
}
