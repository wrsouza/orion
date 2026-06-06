import { Model } from '../model/Model';
import { ModelConstructor } from '../model/ModelBuilder';
import { Collection } from '../model/Collection';
import { Sequence } from './Sequence';

type Attributes = Record<string, unknown>;
type AfterCallback<T extends Model> = (model: T) => void | Promise<void>;

export abstract class Factory<T extends Model> {
  abstract model: ModelConstructor<T>;

  protected _count = 1;
  protected _states: Array<Attributes | Sequence> = [];
  protected _afterMaking: Array<AfterCallback<T>> = [];
  protected _afterCreating: Array<AfterCallback<T>> = [];
  protected _has: Array<{ factory: Factory<any>; relation: string | undefined }> = [];
  protected _for: Array<{ factory: Factory<any>; relation: string | undefined }> = [];
  protected _hasAttached: Array<{
    factory: Factory<any>;
    pivotAttrs: Attributes;
    relation: string | undefined;
  }> = [];
  /** Pool of models to reuse for related model resolution, keyed by class name. */
  protected _recycle: Map<string, Model[]> = new Map();

  constructor() {
    // Allow subclasses to declare afterMaking/afterCreating hooks declaratively.
    this.configure();

    // Return a Proxy so that `factory.hasPosts(Post.factory())` and
    // `factory.forUser(User.factory())` work as magic shorthand methods.
    return new Proxy(this, {
      get(target, prop: string | symbol) {
        if (typeof prop === 'string' && !(prop in target)) {
          if (prop.startsWith('has') && prop.length > 3) {
            const relName = prop.charAt(3).toLowerCase() + prop.slice(4);
            return (childFactory: Factory<any>, relation?: string) =>
              target.has(childFactory, relation ?? relName);
          }
          if (prop.startsWith('for') && prop.length > 3) {
            const relName = prop.charAt(3).toLowerCase() + prop.slice(4);
            return (parentFactory: Factory<any>, relation?: string) =>
              target.for(parentFactory, relation ?? relName);
          }
        }
        return Reflect.get(target, prop);
      },
    });
  }

  // ── Override in subclass ──────────────────────────────────────────────────

  /** Attribute defaults. Override in subclass. */
  abstract definition(): Attributes;

  /**
   * Declarative hook called in the constructor.
   * Override to register `afterMaking` / `afterCreating` callbacks inside the
   * factory class instead of chaining them from outside.
   *
   * @example
   * ```ts
   * class UserFactory extends Factory<User> {
   *   model = User;
   *   definition() { return { name: 'Alice', email: 'a@example.com' }; }
   *
   *   configure(): void {
   *     this.afterCreating(async (user) => {
   *       await Profile.create({ user_id: user.id });
   *     });
   *   }
   * }
   * ```
   */
  protected configure(): void {}

  // ── Fluent configuration ──────────────────────────────────────────────────

  count(n: number): this {
    this._count = n;
    return this;
  }

  state(attrs: Attributes | ((index: number) => Attributes)): this {
    if (typeof attrs === 'function') {
      const fn = attrs;
      this._states.push({ _fn: fn } as any);
    } else {
      this._states.push(attrs);
    }
    return this;
  }

  sequence(...items: Array<Attributes | ((seq: Sequence) => Attributes)>): this {
    this._states.push(new Sequence(...items));
    return this;
  }

  afterMaking(cb: AfterCallback<T>): this {
    this._afterMaking.push(cb);
    return this;
  }

  afterCreating(cb: AfterCallback<T>): this {
    this._afterCreating.push(cb);
    return this;
  }

  /**
   * Declare a hasMany/hasOne relationship to create alongside.
   *
   * ```ts
   * User.factory().has(Post.factory().count(3)).create()
   * // or with magic:
   * User.factory().hasPosts(Post.factory().count(3)).create()
   * ```
   */
  has<R extends Model>(factory: Factory<R>, relation?: string): this {
    this._has.push({ factory, relation });
    return this;
  }

  /**
   * Declare a belongsTo relationship to create and attach.
   *
   * ```ts
   * Post.factory().for(User.factory()).create()
   * // or with magic:
   * Post.factory().forUser(User.factory()).create()
   * ```
   */
  for<R extends Model>(factory: Factory<R>, relation?: string): this {
    this._for.push({ factory, relation });
    return this;
  }

  /**
   * Declare a BelongsToMany relationship to attach via pivot after creation.
   * The related models are created and then attached via `attach()`.
   *
   * @example
   * ```ts
   * User.factory()
   *   .hasAttached(Role.factory().count(2), { approved: true })
   *   .create()
   * ```
   */
  hasAttached<R extends Model>(
    factory: Factory<R>,
    pivotAttrs: Attributes = {},
    relation?: string
  ): this {
    this._hasAttached.push({ factory, pivotAttrs, relation });
    return this;
  }

  /**
   * Supply one or more existing models to reuse when resolving `for` /
   * `belongsTo` relationships instead of creating new records.
   *
   * @example
   * ```ts
   * const admin = await User.factory().create();
   * await Post.factory().count(5).recycle(admin).create();
   * // All 5 posts will have user_id = admin.id
   * ```
   */
  recycle(models: Model | Model[] | Collection<Model>): this {
    const arr =
      models instanceof Collection ? [...models] : Array.isArray(models) ? models : [models];

    for (const m of arr) {
      const key = m.constructor.name;
      if (!this._recycle.has(key)) this._recycle.set(key, []);
      this._recycle.get(key)!.push(m);
    }
    return this;
  }

  /**
   * Apply the built-in "trashed" state — sets `deleted_at` to the current date
   * so the produced model appears soft-deleted.
   * Only meaningful when the model uses the `SoftDeletes` mixin.
   *
   * @example
   * ```ts
   * const deleted = await User.factory().trashed().create();
   * ```
   */
  trashed(): this {
    return this.state({ deleted_at: new Date() });
  }

  // ── Attribute resolution ──────────────────────────────────────────────────

  protected resolveAttributes(index: number): Attributes {
    const base = this.definition();
    for (const state of this._states) {
      if (state instanceof Sequence) {
        Object.assign(base, state.next());
      } else if (typeof (state as any)._fn === 'function') {
        Object.assign(base, (state as any)._fn(index));
      } else {
        Object.assign(base, state as Attributes);
      }
    }
    return base;
  }

  // ── make (unsaved) ────────────────────────────────────────────────────────

  async make(extra?: Attributes): Promise<T>;
  async make(extra?: Attributes, count?: number): Promise<T[]>;
  async make(extra?: Attributes, count?: number): Promise<T | T[]> {
    const n = count ?? this._count;
    const results: T[] = [];

    for (let i = 0; i < n; i++) {
      const attrs = { ...this.resolveAttributes(i), ...(extra ?? {}) };
      const ModelClass = this.model as any;
      const instance: T = new ModelClass();
      instance._attributes = attrs;

      for (const cb of this._afterMaking) {
        await cb(instance);
      }

      results.push(instance);
    }

    this._resetSequences();

    return n === 1 && count === undefined ? results[0] : results;
  }

  // ── create (persisted) ────────────────────────────────────────────────────

  async create(extra?: Attributes): Promise<T>;
  async create(extra?: Attributes, count?: number): Promise<T[]>;
  async create(extra?: Attributes, count?: number): Promise<T | T[]> {
    const n = count ?? this._count;
    const results: T[] = [];

    // Resolve "for" (belongsTo) parents first — respects recycle pool
    const parentAttrs = await this._resolveForRelations();

    for (let i = 0; i < n; i++) {
      const attrs = { ...this.resolveAttributes(i), ...parentAttrs, ...(extra ?? {}) };
      const ModelClass = this.model as any;
      const instance: T = await (ModelClass as any).create(attrs);

      // Create "has" (hasMany/hasOne) children
      await this._createHasRelations(instance);

      // Attach "hasAttached" (BelongsToMany) relations
      await this._createHasAttachedRelations(instance);

      for (const cb of this._afterMaking) await cb(instance);
      for (const cb of this._afterCreating) await cb(instance);

      results.push(instance);
    }

    this._resetSequences();

    return n === 1 && count === undefined ? results[0] : results;
  }

  // ── Relationship helpers ──────────────────────────────────────────────────

  private async _resolveForRelations(): Promise<Attributes> {
    const attrs: Attributes = {};
    for (const { factory, relation } of this._for) {
      const relClassName = (factory.model as any).name ?? factory.model.constructor.name;

      // Check the recycle pool first
      const recycled = this._recycle.get(relClassName);
      const parent: Model =
        recycled && recycled.length > 0
          ? recycled[Math.floor(Math.random() * recycled.length)]
          : ((await factory.create()) as Model);

      const relName = relation ?? _guessRelationName(factory.model);
      const ModelClass = this.model as any;
      const probe = new ModelClass();
      if (typeof probe[relName] === 'function') {
        const rel = probe[relName]() as any;
        const fk: string = rel.foreignKey ?? rel._foreignKey ?? rel._localKey ?? `${relName}_id`;
        attrs[fk] = (parent as any)._attributes[
          (parent.constructor as any).getPrimaryKey?.() ?? 'id'
        ];
      } else {
        const pk = (parent.constructor as any).getPrimaryKey?.() ?? 'id';
        attrs[`${relName}_id`] = (parent as any)._attributes[pk];
      }
    }
    return attrs;
  }

  private async _createHasRelations(parent: T): Promise<void> {
    for (const { factory, relation } of this._has) {
      const relName = relation ?? _guessRelationName(factory.model);
      const parentPk = (parent.constructor as any).getPrimaryKey?.() ?? 'id';
      const parentId = (parent as any)._attributes[parentPk];

      const ChildClass = factory.model as any;
      let fk = `${_guessRelationName(parent.constructor as any)}_id`;
      const parentInstance = parent as any;
      if (typeof parentInstance[relName] === 'function') {
        const rel = parentInstance[relName]() as any;
        if (rel.foreignKey ?? rel._foreignKey) fk = rel.foreignKey ?? rel._foreignKey;
      }

      const count = factory._count;
      for (let i = 0; i < count; i++) {
        const attrs = { ...factory.resolveAttributes(i), [fk]: parentId };
        await (ChildClass as any).create(attrs);
      }
      factory._resetSequences();
    }
  }

  private async _createHasAttachedRelations(parent: T): Promise<void> {
    for (const { factory, pivotAttrs, relation } of this._hasAttached) {
      const relName = relation ?? _guessRelationName(factory.model);
      const parentInstance = parent as any;

      if (typeof parentInstance[relName] !== 'function') {
        throw new Error(
          `[orion] Factory.hasAttached: relation "${relName}" not found on ${parent.constructor.name}.`
        );
      }

      const rel = parentInstance[relName]() as any;
      if (typeof rel.attach !== 'function') {
        throw new Error(
          `[orion] Factory.hasAttached: relation "${relName}" must be a BelongsToMany relation.`
        );
      }

      const count = factory._count;
      for (let i = 0; i < count; i++) {
        const attrs = factory.resolveAttributes(i);
        const related = await (factory.model as any).create(attrs);
        const pk = (related.constructor as any).getPrimaryKey?.() ?? 'id';
        const relatedId = (related as any)._attributes[pk];
        await rel.attach(relatedId, pivotAttrs);
      }
      factory._resetSequences();
    }
  }

  protected _resetSequences(): void {
    for (const state of this._states) {
      if (state instanceof Sequence) state.reset();
    }
  }
}

// ── Resolve a relation/FK name from a model constructor ──────────────────────

function _guessRelationName(ctor: Function): string {
  return ctor.name.charAt(0).toLowerCase() + ctor.name.slice(1);
}
