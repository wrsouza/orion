import { ModelMetadata } from '../ModelMetadata';

/**
 * Map a model property to a different database column name.
 *
 * By default, Orion reads and writes attributes using the exact property
 * name as the column name. Use `@map` when the JS property name and the
 * DB column name differ — the most common case is camelCase properties
 * backed by snake_case columns.
 *
 * @example
 * ```ts
 * \@table('users')
 * \@fillable(['name', 'email'])
 * class User extends Model {
 *   declare id: string;
 *   declare name: string;
 *   declare email: string;
 *
 *   \@map('created_at')
 *   declare createdAt: Date;
 *
 *   \@map('updated_at')
 *   declare updatedAt: Date;
 * }
 *
 * // Read — transparent
 * user.createdAt          // Date, reads from `created_at` column
 *
 * // Write — transparent
 * user.createdAt = new Date();   // stores into `created_at`
 *
 * // Query — translated automatically
 * User.where('createdAt', '>', yesterday).get();  // WHERE "created_at" > ?
 *
 * // Serialization — uses property name
 * user.toArray()   // { createdAt: '...', name: '...' }
 * ```
 */
export function map(columnName: string): PropertyDecorator {
  return (target, propertyKey) => {
    const propName = String(propertyKey);
    // target is the prototype for instance decorators — use the constructor for registry lookup
    const ctor = target.constructor as Function;
    const config = ModelMetadata.get(ctor);
    config.columnMap.set(propName, columnName);
  };
}
