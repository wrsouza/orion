import {
  Cast,
  CastClassConstructor,
  CastableConstructor,
  CastType,
  ModelMetadata,
} from '../ModelMetadata';

/** Accepted types for the `@cast()` property decorator. */
type PropertyCastType =
  | (typeof Cast)[keyof Omit<typeof Cast, 'Decimal'>]
  | ReturnType<typeof Cast.Decimal>
  | CastClassConstructor
  | CastableConstructor;
export type {
  CastClass,
  CastClassConstructor,
  CastsInboundAttributes,
  Castable,
  CastableConstructor,
  ComparesCastableAttributes,
} from '../ModelMetadata';

/**
 * Declare attribute casts for a model.
 * Casts are applied automatically when reading attributes from the model instance.
 *
 * Supported cast types: `'number'`, `'string'`, `'boolean'`, `'json'`, `'date'`, `'array'`
 *
 * @example
 * ```ts
 * \@casts({ price: 'number', settings: 'json', is_active: 'boolean', born_at: 'date' })
 * class Product extends Model { ... }
 * ```
 */
export function casts(map: Record<string, CastType>): ClassDecorator {
  return (target) => {
    const config = ModelMetadata.get(target);
    config.casts = { ...config.casts, ...map };
  };
}

/**
 * Hide columns from serialization.
 *
 * **Class decorator** — hides a list of properties at once:
 * ```ts
 * \@hidden(['password', 'remember_token'])
 * class User extends Model { ... }
 * ```
 *
 * **Property decorator** — hides a single property:
 * ```ts
 * class User extends Model {
 *   \@hidden()
 *   declare password: string;
 * }
 * ```
 */
export function hidden(columns: string[]): ClassDecorator;
export function hidden(): PropertyDecorator;
export function hidden(columns?: string[]): ClassDecorator | PropertyDecorator {
  if (columns !== undefined) {
    return (target: Function) => {
      ModelMetadata.get(target).hidden = columns;
    };
  }
  return (target: object, propertyKey: string | symbol) => {
    const propName = String(propertyKey);
    const ctor = target.constructor as Function;
    const config = ModelMetadata.get(ctor);
    if (!config.hidden.includes(propName)) {
      config.hidden = [...config.hidden, propName];
    }
  };
}

/**
 * Allowlist of columns to expose in serialization (inverse of `@hidden`).
 * When set, *only* these columns appear in `toArray()` / `toJSON()` output.
 *
 * @example
 * ```ts
 * \@visible(['id', 'name', 'email'])
 * class User extends Model { ... }
 * ```
 */
export function visible(columns: string[]): ClassDecorator {
  return (target) => {
    ModelMetadata.get(target).visible = columns;
  };
}

/**
 * Declare computed accessor names to be appended to `toArray()` / `toJSON()` output.
 * Each name must correspond to a getter (or `@accessor`) defined on the model.
 *
 * @example
 * ```ts
 * \@appends(['full_name'])
 * class User extends Model {
 *   get full_name(): string {
 *     return `${this._attributes.first_name} ${this._attributes.last_name}`;
 *   }
 * }
 * ```
 */
export function appends(attrs: string[]): ClassDecorator {
  return (target) => {
    ModelMetadata.get(target).appends = attrs;
  };
}

/**
 * Mark a getter as a model accessor.
 * Registers the getter in `ModelMetadata` and ensures it is included when
 * listed in `@appends`.  The getter already works transparently on the model
 * instance — this decorator is mainly semantic and enables tooling support.
 *
 * The getter receives the **proxied** model instance as `this`, so normal
 * attribute access (`this.first_name`) works without using `_attributes`.
 *
 * @example
 * ```ts
 * \@table('users')
 * \@appends(['full_name'])
 * class User extends Model {
 *   \@accessor
 *   get full_name(): string {
 *     return `${this.first_name} ${this.last_name}`;
 *   }
 * }
 * ```
 */
/**
 * Declare a cast for a single model property.
 * Prefer `Cast.*` enum values over raw strings to avoid typos.
 * For custom cast classes, pass the constructor directly.
 *
 * @example
 * ```ts
 * class User extends Model {
 *   \@cast(Cast.Boolean)
 *   declare isActive: boolean;
 *
 *   \@cast(Cast.Date)
 *   declare bornAt: Date;
 *
 *   \@cast(Cast.Decimal(2))
 *   declare price: number;
 *
 *   \@cast(MoneyCast)
 *   declare balance: Money;
 * }
 * ```
 */
export function cast(type: PropertyCastType): PropertyDecorator {
  return (target, propertyKey) => {
    const propName = String(propertyKey);
    const ctor = target.constructor as Function;
    const config = ModelMetadata.get(ctor);
    config.casts = { ...config.casts, [propName]: type };
  };
}

export function accessor(
  target: any,
  propertyKey: string,
  descriptor: PropertyDescriptor
): PropertyDescriptor {
  if (typeof descriptor.get !== 'function') {
    throw new Error(`[orion] @accessor must be applied to a getter ("${propertyKey}").`);
  }
  ModelMetadata.get(target.constructor).accessors.set(propertyKey, descriptor.get);
  return descriptor;
}

/**
 * Mark a setter as a model mutator.
 * When `model.property = value` is assigned, the registered setter runs instead
 * of the default `_attributes[property] = value` behaviour.
 * The setter is responsible for writing the transformed value into `_attributes`.
 *
 * @example
 * ```ts
 * \@fillable(['name', 'password'])
 * class User extends Model {
 *   \@mutator
 *   set password(value: string) {
 *     this._attributes['password'] = bcrypt.hashSync(value, 10);
 *   }
 * }
 * ```
 */
export function mutator(
  target: any,
  propertyKey: string,
  descriptor: PropertyDescriptor
): PropertyDescriptor {
  if (typeof descriptor.set !== 'function') {
    throw new Error(`[orion] @mutator must be applied to a setter ("${propertyKey}").`);
  }
  ModelMetadata.get(target.constructor).mutators.set(propertyKey, descriptor.set);
  return descriptor;
}
