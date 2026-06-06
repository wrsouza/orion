import { ModelMetadata } from '../ModelMetadata';

/**
 * Override the database table name and/or primary key for a model.
 *
 * @example
 * ```ts
 * \@table('flight_records')
 * class Flight extends Model { ... }
 *
 * \@table({ name: 'flight_records', primaryKey: 'flight_id', timestamps: false })
 * class Flight extends Model { ... }
 * ```
 */
export function table(
  nameOrOptions:
    | string
    | {
        name?: string;
        primaryKey?: string;
        incrementing?: boolean;
        keyType?: 'number' | 'string';
        timestamps?: boolean;
        createdAt?: string;
        updatedAt?: string;
        connection?: string;
      }
): ClassDecorator {
  return (target) => {
    const config = ModelMetadata.get(target);

    if (typeof nameOrOptions === 'string') {
      config.table = nameOrOptions;
    } else {
      if (nameOrOptions.name !== undefined) config.table = nameOrOptions.name;
      if (nameOrOptions.primaryKey !== undefined) config.primaryKey = nameOrOptions.primaryKey;
      if (nameOrOptions.incrementing !== undefined)
        config.incrementing = nameOrOptions.incrementing;
      if (nameOrOptions.keyType !== undefined) config.keyType = nameOrOptions.keyType;
      if (nameOrOptions.timestamps !== undefined) config.timestamps = nameOrOptions.timestamps;
      if (nameOrOptions.createdAt !== undefined) config.createdAtColumn = nameOrOptions.createdAt;
      if (nameOrOptions.updatedAt !== undefined) config.updatedAtColumn = nameOrOptions.updatedAt;
      if (nameOrOptions.connection !== undefined) config.connection = nameOrOptions.connection;
    }
  };
}

/**
 * Disable automatic timestamp management (`created_at` / `updated_at`) for a model.
 *
 * @example
 * ```ts
 * \@withoutTimestamps
 * class EventLog extends Model { ... }
 * ```
 */
export const withoutTimestamps: ClassDecorator = (target) => {
  ModelMetadata.get(target).timestamps = false;
};
