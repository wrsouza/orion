import { ModelMetadata } from '../ModelMetadata';

/**
 * Mark a property as an auto-generated UUID v4 primary key (or extra UUID column).
 * Sets `incrementing: false` and `keyType: 'string'` on the model config automatically.
 *
 * @example
 * ```ts
 * \@table('users')
 * class User extends Model {
 *   \@uuid()
 *   declare id: string;
 * }
 * ```
 */
export function uuid(): PropertyDecorator {
  return (target: Object, propertyKey: string | symbol) => {
    const ctor = target.constructor as Function;
    const config = ModelMetadata.get(ctor);

    config.incrementing = false;
    config.keyType = 'string';
    config.uuidFields.push(propertyKey as string);

    if (!Object.prototype.hasOwnProperty.call(target, '_applyUniqueIds')) {
      (target as any)._applyUniqueIds = function () {
        const cfg = ModelMetadata.resolve(this as any);
        for (const field of cfg.uuidFields) {
          if (!(this as any)._attributes[field]) {
            (this as any)._attributes[field] = require('crypto').randomUUID() as string;
          }
        }
      };
    }
  };
}
