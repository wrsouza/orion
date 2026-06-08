import { describe, it, expect } from 'vitest';
import { Blueprint } from '../../src/schema/Blueprint';
import { ColumnDefinition } from '../../src/schema/ColumnDefinition';
import { ForeignKeyDefinition } from '../../src/schema/ForeignKeyDefinition';
import { SQLiteSchemaGrammar } from '../../src/schema/grammars/SQLiteSchemaGrammar';
import { MySQLSchemaGrammar } from '../../src/schema/grammars/MySQLSchemaGrammar';
import { MariaDBSchemaGrammar } from '../../src/schema/grammars/MariaDBSchemaGrammar';

// ── Blueprint column methods ──────────────────────────────────────────────────

describe('Blueprint – column definitions', () => {
  it('id() adds bigIncrements column named "id"', () => {
    const bp = new Blueprint('t');
    const col = bp.id();
    expect(col.name).toBe('id');
    expect(col.type).toBe('bigIncrements');
    expect(col.modifiers.autoIncrement).toBe(true);
    expect(bp.columns).toHaveLength(1);
  });

  it('id(name) uses custom name', () => {
    const bp = new Blueprint('t');
    const col = bp.id('uid');
    expect(col.name).toBe('uid');
  });

  it('increments() adds autoIncrement column', () => {
    const bp = new Blueprint('t');
    const col = bp.increments('id');
    expect(col.type).toBe('increments');
    expect(col.modifiers.autoIncrement).toBe(true);
  });

  it('bigIncrements() adds bigIncrements column', () => {
    const bp = new Blueprint('t');
    const col = bp.bigIncrements('id');
    expect(col.type).toBe('bigIncrements');
    expect(col.modifiers.autoIncrement).toBe(true);
  });

  it('integer()', () => {
    const bp = new Blueprint('t');
    const col = bp.integer('count');
    expect(col.type).toBe('integer');
    expect(col.name).toBe('count');
  });

  it('bigInteger()', () => {
    const bp = new Blueprint('t');
    expect(bp.bigInteger('big').type).toBe('bigInteger');
  });

  it('smallInteger()', () => {
    const bp = new Blueprint('t');
    expect(bp.smallInteger('small').type).toBe('smallInteger');
  });

  it('tinyInteger()', () => {
    const bp = new Blueprint('t');
    expect(bp.tinyInteger('tiny').type).toBe('tinyInteger');
  });

  it('unsignedInteger() sets unsigned modifier', () => {
    const bp = new Blueprint('t');
    const col = bp.unsignedInteger('qty');
    expect(col.type).toBe('integer');
    expect(col.modifiers.unsigned).toBe(true);
  });

  it('unsignedBigInteger() sets unsigned modifier', () => {
    const bp = new Blueprint('t');
    const col = bp.unsignedBigInteger('user_id');
    expect(col.type).toBe('bigInteger');
    expect(col.modifiers.unsigned).toBe(true);
  });

  it('string() with default length 255', () => {
    const bp = new Blueprint('t');
    const col = bp.string('email');
    expect(col.type).toBe('string');
    expect(col.length).toBe(255);
  });

  it('string() with custom length', () => {
    const bp = new Blueprint('t');
    const col = bp.string('code', 10);
    expect(col.length).toBe(10);
  });

  it('char() with default length 1', () => {
    const bp = new Blueprint('t');
    const col = bp.char('flag');
    expect(col.type).toBe('char');
    expect(col.length).toBe(1);
  });

  it('char() with custom length', () => {
    const bp = new Blueprint('t');
    expect(bp.char('abbr', 3).length).toBe(3);
  });

  it('text()', () => {
    expect(new Blueprint('t').text('body').type).toBe('text');
  });

  it('mediumText()', () => {
    expect(new Blueprint('t').mediumText('content').type).toBe('mediumText');
  });

  it('longText()', () => {
    expect(new Blueprint('t').longText('data').type).toBe('longText');
  });

  it('boolean()', () => {
    expect(new Blueprint('t').boolean('active').type).toBe('boolean');
  });

  it('float()', () => {
    expect(new Blueprint('t').float('score').type).toBe('float');
  });

  it('double()', () => {
    expect(new Blueprint('t').double('ratio').type).toBe('double');
  });

  it('decimal() with defaults', () => {
    const col = new Blueprint('t').decimal('price');
    expect(col.type).toBe('decimal');
    expect(col.precision).toBe(8);
    expect(col.scale).toBe(2);
  });

  it('decimal() with custom precision/scale', () => {
    const col = new Blueprint('t').decimal('amount', 10, 4);
    expect(col.precision).toBe(10);
    expect(col.scale).toBe(4);
  });

  it('date()', () => {
    expect(new Blueprint('t').date('dob').type).toBe('date');
  });

  it('time()', () => {
    expect(new Blueprint('t').time('start_at').type).toBe('time');
  });

  it('timestamp()', () => {
    expect(new Blueprint('t').timestamp('created_at').type).toBe('timestamp');
  });

  it('timestampTz()', () => {
    expect(new Blueprint('t').timestampTz('created_at').type).toBe('timestampTz');
  });

  it('timestamps() adds created_at and updated_at as nullable', () => {
    const bp = new Blueprint('t');
    bp.timestamps();
    expect(bp.columns).toHaveLength(2);
    expect(bp.columns[0].name).toBe('created_at');
    expect(bp.columns[0].modifiers.nullable).toBe(true);
    expect(bp.columns[1].name).toBe('updated_at');
    expect(bp.columns[1].modifiers.nullable).toBe(true);
  });

  it('timestampsTz() adds timezone-aware nullable timestamps', () => {
    const bp = new Blueprint('t');
    bp.timestampsTz();
    expect(bp.columns[0].type).toBe('timestampTz');
    expect(bp.columns[1].type).toBe('timestampTz');
  });

  it('softDeletes() adds nullable deleted_at timestamp', () => {
    const bp = new Blueprint('t');
    const col = bp.softDeletes();
    expect(col.name).toBe('deleted_at');
    expect(col.type).toBe('timestamp');
    expect(col.modifiers.nullable).toBe(true);
  });

  it('softDeletes() with custom column name', () => {
    const bp = new Blueprint('t');
    const col = bp.softDeletes('removed_at');
    expect(col.name).toBe('removed_at');
  });

  it('softDeletesTz() adds nullable timestampTz column', () => {
    const bp = new Blueprint('t');
    const col = bp.softDeletesTz();
    expect(col.type).toBe('timestampTz');
    expect(col.modifiers.nullable).toBe(true);
  });

  it('json()', () => {
    expect(new Blueprint('t').json('meta').type).toBe('json');
  });

  it('jsonb()', () => {
    expect(new Blueprint('t').jsonb('data').type).toBe('jsonb');
  });

  it('uuid() defaults to "id"', () => {
    const col = new Blueprint('t').uuid();
    expect(col.name).toBe('id');
    expect(col.type).toBe('uuid');
  });

  it('uuid() with custom name', () => {
    expect(new Blueprint('t').uuid('uid').name).toBe('uid');
  });

  it('ulid() defaults to "id"', () => {
    const col = new Blueprint('t').ulid();
    expect(col.name).toBe('id');
    expect(col.type).toBe('ulid');
  });

  it('binary()', () => {
    expect(new Blueprint('t').binary('data').type).toBe('binary');
  });

  it('enum() stores values', () => {
    const col = new Blueprint('t').enum('status', ['active', 'inactive']);
    expect(col.type).toBe('enum');
    expect(col.enumValues).toEqual(['active', 'inactive']);
  });

  it('foreignId() adds unsigned bigInteger column and returns ForeignKeyDefinition', () => {
    const bp = new Blueprint('t');
    const fk = bp.foreignId('user_id');
    // Column was added
    expect(bp.columns[0].type).toBe('bigInteger');
    expect(bp.columns[0].modifiers.unsigned).toBe(true);
    // Returns ForeignKeyDefinition for chaining
    expect(fk).toBeInstanceOf(ForeignKeyDefinition);
    expect(bp.foreignKeys).toHaveLength(1);
  });

  it('foreignUuid() adds uuid column and returns ForeignKeyDefinition', () => {
    const bp = new Blueprint('t');
    const fk = bp.foreignUuid('order_id');
    // Column was added
    expect(bp.columns[0].type).toBe('uuid');
    // Returns ForeignKeyDefinition for chaining
    expect(fk).toBeInstanceOf(ForeignKeyDefinition);
    expect(bp.foreignKeys).toHaveLength(1);
  });

  it('foreignId() supports full FK chain', () => {
    const bp = new Blueprint('posts');
    bp.foreignId('user_id').references('id').on('users').onDelete('CASCADE');
    expect(bp.foreignKeys[0].referencedTable).toBe('users');
    expect(bp.foreignKeys[0].onDeleteAction).toBe('CASCADE');
  });
});

// ── Column modifiers ──────────────────────────────────────────────────────────

describe('Blueprint – column modifiers', () => {
  it('nullable() sets modifier', () => {
    const col = new Blueprint('t').string('x').nullable();
    expect(col.modifiers.nullable).toBe(true);
  });

  it('default() sets modifier', () => {
    const col = new Blueprint('t').integer('n').default(0);
    expect(col.modifiers.hasDefault).toBe(true);
    expect(col.modifiers.default).toBe(0);
  });

  it('default(null) is allowed', () => {
    const col = new Blueprint('t').string('s').default(null);
    expect(col.modifiers.hasDefault).toBe(true);
    expect(col.modifiers.default).toBeNull();
  });

  it('unique() sets modifier', () => {
    const col = new Blueprint('t').string('email').unique();
    expect(col.modifiers.unique).toBe(true);
  });

  it('unsigned() sets modifier', () => {
    const col = new Blueprint('t').integer('qty').unsigned();
    expect(col.modifiers.unsigned).toBe(true);
  });

  it('index() sets modifier', () => {
    const col = new Blueprint('t').string('slug').index();
    expect(col.modifiers.index).toBe(true);
  });

  it('comment() sets modifier', () => {
    const col = new Blueprint('t').string('x').comment('my note');
    expect(col.modifiers.comment).toBe('my note');
  });

  it('modifiers chain fluently', () => {
    const col = new Blueprint('t').string('x').nullable().default('hi').unique();
    expect(col.modifiers.nullable).toBe(true);
    expect(col.modifiers.default).toBe('hi');
    expect(col.modifiers.unique).toBe(true);
  });
});

// ── Blueprint indexes ─────────────────────────────────────────────────────────

describe('Blueprint – indexes', () => {
  it('primary() adds primary index', () => {
    const bp = new Blueprint('t');
    bp.primary(['id']);
    expect(bp.indexes).toHaveLength(1);
    expect(bp.indexes[0].type).toBe('primary');
    expect(bp.indexes[0].columns).toEqual(['id']);
  });

  it('primary() with custom name', () => {
    const bp = new Blueprint('t');
    bp.primary('id', 'pk_users');
    expect(bp.indexes[0].name).toBe('pk_users');
  });

  it('unique() adds unique index', () => {
    const bp = new Blueprint('t');
    bp.unique(['email', 'tenant_id']);
    expect(bp.indexes[0].type).toBe('unique');
    expect(bp.indexes[0].columns).toEqual(['email', 'tenant_id']);
  });

  it('index() adds plain index', () => {
    const bp = new Blueprint('t');
    bp.index('name');
    expect(bp.indexes[0].type).toBe('index');
    expect(bp.indexes[0].columns).toEqual(['name']);
  });
});

// ── Blueprint foreign keys ────────────────────────────────────────────────────

describe('Blueprint – foreign keys', () => {
  it('foreign().references().on() configures FK', () => {
    const bp = new Blueprint('orders');
    const fk = bp.foreign('user_id').references('id').on('users');
    expect(bp.foreignKeys).toHaveLength(1);
    expect(fk.columns).toEqual(['user_id']);
    expect(fk.referencedColumns).toEqual(['id']);
    expect(fk.referencedTable).toBe('users');
  });

  it('foreign() with onDelete/onUpdate', () => {
    const bp = new Blueprint('orders');
    const fk = bp.foreign('user_id').references('id').on('users').onDelete('CASCADE').onUpdate('SET NULL');
    expect(fk.onDeleteAction).toBe('CASCADE');
    expect(fk.onUpdateAction).toBe('SET NULL');
  });

  it('foreign() with custom constraint name', () => {
    const bp = new Blueprint('orders');
    const fk = bp.foreign('user_id').references('id').on('users').name('fk_custom');
    expect(fk.constraintName).toBe('fk_custom');
  });

  it('foreign() with multiple columns', () => {
    const bp = new Blueprint('t');
    const fk = bp.foreign(['a', 'b']).references(['x', 'y']).on('other');
    expect(fk.columns).toEqual(['a', 'b']);
    expect(fk.referencedColumns).toEqual(['x', 'y']);
  });
});

// ── Blueprint drop helpers ────────────────────────────────────────────────────

describe('Blueprint – drop helpers', () => {
  it('dropColumn(string) appends to droppedColumns', () => {
    const bp = new Blueprint('t');
    bp.dropColumn('name');
    expect(bp.droppedColumns).toEqual(['name']);
  });

  it('dropColumn(array) appends multiple', () => {
    const bp = new Blueprint('t');
    bp.dropColumn(['a', 'b']);
    expect(bp.droppedColumns).toEqual(['a', 'b']);
  });

  it('dropTimestamps() drops created_at and updated_at', () => {
    const bp = new Blueprint('t');
    bp.dropTimestamps();
    expect(bp.droppedColumns).toEqual(['created_at', 'updated_at']);
  });

  it('dropSoftDeletes() drops deleted_at', () => {
    const bp = new Blueprint('t');
    bp.dropSoftDeletes();
    expect(bp.droppedColumns).toEqual(['deleted_at']);
  });

  it('dropSoftDeletes() with custom column name', () => {
    const bp = new Blueprint('t');
    bp.dropSoftDeletes('removed_at');
    expect(bp.droppedColumns).toEqual(['removed_at']);
  });

  it('dropIndex() appends to droppedIndexes', () => {
    const bp = new Blueprint('t');
    bp.dropIndex('users_email_index');
    expect(bp.droppedIndexes).toEqual(['users_email_index']);
  });

  it('dropForeign() appends to droppedForeignKeys', () => {
    const bp = new Blueprint('t');
    bp.dropForeign('fk_user');
    expect(bp.droppedForeignKeys).toEqual(['fk_user']);
  });
});

// ── uuidMorphs ────────────────────────────────────────────────────────────────

describe('Blueprint – uuidMorphs', () => {
  it('uuidMorphs() adds type, id, and index', () => {
    const bp = new Blueprint('t');
    bp.uuidMorphs('commentable');
    expect(bp.columns[0].name).toBe('commentable_type');
    expect(bp.columns[0].type).toBe('string');
    expect(bp.columns[1].name).toBe('commentable_id');
    expect(bp.columns[1].type).toBe('uuid');
    expect(bp.indexes).toHaveLength(1);
    expect(bp.indexes[0].columns).toEqual(['commentable_type', 'commentable_id']);
  });
});

// ── ColumnDefinition standalone ───────────────────────────────────────────────

describe('ColumnDefinition', () => {
  it('defaults are correct', () => {
    const col = new ColumnDefinition('x', 'integer');
    expect(col.modifiers.nullable).toBe(false);
    expect(col.modifiers.hasDefault).toBe(false);
    expect(col.modifiers.unique).toBe(false);
    expect(col.modifiers.unsigned).toBe(false);
    expect(col.modifiers.autoIncrement).toBe(false);
    expect(col.modifiers.index).toBe(false);
    expect(col.modifiers.comment).toBeNull();
  });
});

// ── ForeignKeyDefinition standalone ──────────────────────────────────────────

describe('ForeignKeyDefinition', () => {
  it('defaults are correct', () => {
    const fk = new ForeignKeyDefinition('col');
    expect(fk.columns).toEqual(['col']);
    expect(fk.onDeleteAction).toBe('RESTRICT');
    expect(fk.onUpdateAction).toBe('RESTRICT');
    expect(fk.referencedTable).toBe('');
  });

  it('handles array column input', () => {
    const fk = new ForeignKeyDefinition(['a', 'b']);
    expect(fk.columns).toEqual(['a', 'b']);
  });
});

// ── SQLiteSchemaGrammar ───────────────────────────────────────────────────────

describe('SQLiteSchemaGrammar – compileCreate', () => {
  const grammar = new SQLiteSchemaGrammar();

  it('produces CREATE TABLE with double-quoted identifiers', () => {
    const bp = new Blueprint('users');
    bp.increments('id');
    bp.string('name');
    const result = grammar.compileCreate(bp);
    expect(result.createTable).toContain('CREATE TABLE "users"');
    expect(result.createTable).toContain('"id" INTEGER PRIMARY KEY AUTOINCREMENT');
    expect(result.createTable).toContain('"name" TEXT NOT NULL');
  });

  it('compiles nullable column with NULL', () => {
    const bp = new Blueprint('t');
    bp.string('bio').nullable();
    const result = grammar.compileCreate(bp);
    expect(result.createTable).toContain('"bio" TEXT NULL');
  });

  it('compiles column with default string', () => {
    const bp = new Blueprint('t');
    bp.string('status').default('active');
    const result = grammar.compileCreate(bp);
    expect(result.createTable).toContain("DEFAULT 'active'");
  });

  it('compiles column with default number', () => {
    const bp = new Blueprint('t');
    bp.integer('count').default(0);
    const result = grammar.compileCreate(bp);
    expect(result.createTable).toContain('DEFAULT 0');
  });

  it('compiles column with default null', () => {
    const bp = new Blueprint('t');
    bp.string('x').default(null);
    const result = grammar.compileCreate(bp);
    expect(result.createTable).toContain('DEFAULT NULL');
  });

  it('compiles column with default boolean true as 1', () => {
    const bp = new Blueprint('t');
    bp.boolean('active').default(true);
    const result = grammar.compileCreate(bp);
    expect(result.createTable).toContain('DEFAULT 1');
  });

  it('compiles column with default boolean false as 0', () => {
    const bp = new Blueprint('t');
    bp.boolean('active').default(false);
    const result = grammar.compileCreate(bp);
    expect(result.createTable).toContain('DEFAULT 0');
  });

  it('compiles column with unique modifier', () => {
    const bp = new Blueprint('t');
    bp.string('email').unique();
    const result = grammar.compileCreate(bp);
    expect(result.createTable).toContain('UNIQUE');
  });

  it('compiles enum as TEXT CHECK', () => {
    const bp = new Blueprint('t');
    bp.enum('status', ['a', 'b']);
    const result = grammar.compileCreate(bp);
    expect(result.createTable).toContain(`TEXT CHECK("status" IN ('a', 'b'))`);
  });

  it('throws for enum with no values', () => {
    const bp = new Blueprint('t');
    bp.enum('status', []);
    expect(() => grammar.compileCreate(bp)).toThrow(/Enum column/);
  });

  it('compiles primary key from index', () => {
    const bp = new Blueprint('t');
    bp.integer('a');
    bp.integer('b');
    bp.primary(['a', 'b']);
    const result = grammar.compileCreate(bp);
    expect(result.createTable).toContain('PRIMARY KEY ("a", "b")');
  });

  it('emits standalone CREATE INDEX for index type', () => {
    const bp = new Blueprint('t');
    bp.bigIncrements('id');
    bp.string('slug');
    bp.index('slug');
    const result = grammar.compileCreate(bp);
    expect(result.indexes).toHaveLength(1);
    expect(result.indexes[0]).toContain('CREATE INDEX');
  });

  it('emits CREATE UNIQUE INDEX for unique type', () => {
    const bp = new Blueprint('t');
    bp.bigIncrements('id');
    bp.string('email');
    bp.unique('email');
    const result = grammar.compileCreate(bp);
    expect(result.indexes[0]).toContain('CREATE UNIQUE INDEX');
  });

  it('emits index for column with .index() modifier', () => {
    const bp = new Blueprint('t');
    bp.bigIncrements('id');
    bp.string('ref').index();
    const result = grammar.compileCreate(bp);
    expect(result.indexes.some((s) => s.includes('"ref"'))).toBe(true);
  });

  it('includes inline FK in createTable SQL', () => {
    const bp = new Blueprint('orders');
    bp.bigIncrements('id');
    bp.unsignedBigInteger('user_id');
    bp.foreign('user_id').references('id').on('users');
    const result = grammar.compileCreate(bp);
    expect(result.createTable).toContain('FOREIGN KEY ("user_id") REFERENCES "users" ("id")');
    expect(result.foreignKeys).toHaveLength(0);
  });

  it('throws for FK without .on()', () => {
    const bp = new Blueprint('orders');
    bp.bigIncrements('id');
    bp.foreign('user_id').references('id');
    expect(() => grammar.compileCreate(bp)).toThrow(/reference a table/);
  });

  it('compiles all basic types without error', () => {
    const bp = new Blueprint('all_types');
    bp.bigIncrements('id');
    bp.bigInteger('big');
    bp.integer('int');
    bp.smallInteger('small');
    bp.tinyInteger('tiny');
    bp.boolean('flag');
    bp.char('code', 2);
    bp.text('body');
    bp.mediumText('med');
    bp.longText('lng');
    bp.float('f');
    bp.double('d');
    bp.decimal('price', 10, 2);
    bp.uuid('uid');
    bp.ulid('ulid_col');
    bp.json('data');
    bp.jsonb('datab');
    bp.timestamp('ts');
    bp.timestampTz('tstz');
    bp.date('dt');
    bp.time('tm');
    bp.binary('blob_col');
    bp.enum('status', ['x']);
    const result = grammar.compileCreate(bp);
    expect(result.createTable).toBeDefined();
  });

  it('uses default index name from table and column', () => {
    const bp = new Blueprint('posts');
    bp.bigIncrements('id');
    bp.string('title');
    bp.index('title');
    const result = grammar.compileCreate(bp);
    expect(result.indexes[0]).toContain('posts_title_index');
  });

  it('uses custom index name when provided', () => {
    const bp = new Blueprint('posts');
    bp.bigIncrements('id');
    bp.string('title');
    bp.index('title', 'my_idx');
    const result = grammar.compileCreate(bp);
    expect(result.indexes[0]).toContain('"my_idx"');
  });
});

describe('SQLiteSchemaGrammar – compileAlter', () => {
  const grammar = new SQLiteSchemaGrammar();

  it('emits ADD COLUMN for new columns', () => {
    const bp = new Blueprint('users');
    bp.string('bio');
    const result = grammar.compileAlter(bp);
    expect(result.alterTable![0]).toContain('ALTER TABLE "users" ADD COLUMN "bio" TEXT NOT NULL');
  });

  it('emits DROP COLUMN for dropped columns', () => {
    const bp = new Blueprint('users');
    bp.dropColumn('bio');
    const result = grammar.compileAlter(bp);
    expect(result.alterTable![0]).toContain('DROP COLUMN "bio"');
  });

  it('emits DROP INDEX for dropped indexes', () => {
    const bp = new Blueprint('users');
    bp.dropIndex('idx_name');
    const result = grammar.compileAlter(bp);
    expect(result.alterTable![0]).toContain('DROP INDEX IF EXISTS "idx_name"');
  });

  it('emits comment for dropped FKs (not supported in SQLite)', () => {
    const bp = new Blueprint('users');
    bp.dropForeign('fk_user');
    const result = grammar.compileAlter(bp);
    expect(result.alterTable![0]).toContain('-- SQLite does not support DROP FOREIGN KEY');
  });

  it('emits comment for FK additions via alter (not supported in SQLite)', () => {
    const bp = new Blueprint('orders');
    bp.foreign('user_id').references('id').on('users');
    const result = grammar.compileAlter(bp);
    expect(result.alterTable![0]).toContain('-- SQLite does not support ADD CONSTRAINT');
  });
});

describe('SQLiteSchemaGrammar – other methods', () => {
  const grammar = new SQLiteSchemaGrammar();

  it('compileDrop()', () => {
    expect(grammar.compileDrop('users')).toBe('DROP TABLE "users"');
  });

  it('compileDropIfExists()', () => {
    expect(grammar.compileDropIfExists('users')).toBe('DROP TABLE IF EXISTS "users"');
  });

  it('compileTableExists()', () => {
    const sql = grammar.compileTableExists('users');
    expect(sql).toContain('sqlite_master');
    expect(sql).toContain("'users'");
  });

  it('compileColumnListing()', () => {
    expect(grammar.compileColumnListing('users')).toContain('PRAGMA table_info("users")');
  });

  it('wrap handles dotted identifiers', () => {
    const bp = new Blueprint('schema.users');
    bp.bigIncrements('id');
    const result = grammar.compileCreate(bp);
    expect(result.createTable).toContain('"schema"."users"');
  });
});

// ── MySQLSchemaGrammar ────────────────────────────────────────────────────────

describe('MySQLSchemaGrammar – compileCreate', () => {
  const grammar = new MySQLSchemaGrammar();

  it('uses backtick identifiers and ENGINE=InnoDB', () => {
    const bp = new Blueprint('users');
    bp.increments('id');
    bp.string('name');
    const result = grammar.compileCreate(bp);
    expect(result.createTable).toContain('CREATE TABLE `users`');
    expect(result.createTable).toContain('ENGINE=InnoDB');
    expect(result.createTable).toContain('`id`');
    expect(result.createTable).toContain('`name`');
  });

  it('compiles bigIncrements as BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY', () => {
    const bp = new Blueprint('t');
    bp.bigIncrements('id');
    const result = grammar.compileCreate(bp);
    expect(result.createTable).toContain('BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY');
  });

  it('compiles increments as INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY', () => {
    const bp = new Blueprint('t');
    bp.increments('id');
    const result = grammar.compileCreate(bp);
    expect(result.createTable).toContain('INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY');
  });

  it('compiles boolean as TINYINT(1)', () => {
    const bp = new Blueprint('t');
    bp.boolean('active');
    const result = grammar.compileCreate(bp);
    expect(result.createTable).toContain('TINYINT(1)');
  });

  it('compiles string as VARCHAR', () => {
    const bp = new Blueprint('t');
    bp.string('email', 100);
    const result = grammar.compileCreate(bp);
    expect(result.createTable).toContain('VARCHAR(100)');
  });

  it('compiles char', () => {
    const bp = new Blueprint('t');
    bp.char('code', 3);
    const result = grammar.compileCreate(bp);
    expect(result.createTable).toContain('CHAR(3)');
  });

  it('compiles decimal', () => {
    const bp = new Blueprint('t');
    bp.decimal('price', 10, 4);
    const result = grammar.compileCreate(bp);
    expect(result.createTable).toContain('DECIMAL(10, 4)');
  });

  it('compiles enum as ENUM(...)', () => {
    const bp = new Blueprint('t');
    bp.enum('role', ['admin', 'user']);
    const result = grammar.compileCreate(bp);
    expect(result.createTable).toContain("ENUM('admin', 'user')");
  });

  it('throws for enum with no values', () => {
    const bp = new Blueprint('t');
    bp.enum('role', []);
    expect(() => grammar.compileCreate(bp)).toThrow(/Enum column/);
  });

  it('compiles uuid as CHAR(36)', () => {
    const bp = new Blueprint('t');
    bp.uuid('uid');
    const result = grammar.compileCreate(bp);
    expect(result.createTable).toContain('CHAR(36)');
  });

  it('compiles ulid as CHAR(26)', () => {
    const bp = new Blueprint('t');
    bp.ulid('ulid_col');
    const result = grammar.compileCreate(bp);
    expect(result.createTable).toContain('CHAR(26)');
  });

  it('compiles jsonb as JSON', () => {
    const bp = new Blueprint('t');
    bp.jsonb('data');
    const result = grammar.compileCreate(bp);
    expect(result.createTable).toContain('JSON');
  });

  it('compiles timestamp as TIMESTAMP', () => {
    const bp = new Blueprint('t');
    bp.timestamp('created_at');
    const result = grammar.compileCreate(bp);
    expect(result.createTable).toContain('TIMESTAMP');
  });

  it('compiles binary as BLOB', () => {
    const bp = new Blueprint('t');
    bp.binary('data');
    const result = grammar.compileCreate(bp);
    expect(result.createTable).toContain('BLOB');
  });

  it('compiles unsigned modifier', () => {
    const bp = new Blueprint('t');
    bp.integer('qty').unsigned();
    const result = grammar.compileCreate(bp);
    expect(result.createTable).toContain('UNSIGNED');
  });

  it('compiles nullable column with NULL', () => {
    const bp = new Blueprint('t');
    bp.string('bio').nullable();
    const result = grammar.compileCreate(bp);
    expect(result.createTable).toContain('NULL');
    expect(result.createTable).not.toContain('NOT NULL');
  });

  it('compiles default string value', () => {
    const bp = new Blueprint('t');
    bp.string('status').default('active');
    const result = grammar.compileCreate(bp);
    expect(result.createTable).toContain("DEFAULT 'active'");
  });

  it('compiles default null value', () => {
    const bp = new Blueprint('t');
    bp.string('x').default(null);
    const result = grammar.compileCreate(bp);
    expect(result.createTable).toContain('DEFAULT NULL');
  });

  it('compiles unique modifier inline', () => {
    const bp = new Blueprint('t');
    bp.string('email').unique();
    const result = grammar.compileCreate(bp);
    expect(result.createTable).toContain('UNIQUE');
  });

  it('compiles comment inline', () => {
    const bp = new Blueprint('t');
    bp.string('name').comment('user name');
    const result = grammar.compileCreate(bp);
    expect(result.createTable).toContain("COMMENT 'user name'");
  });

  it('comment escapes single quotes', () => {
    const bp = new Blueprint('t');
    bp.string('name').comment("it's");
    const result = grammar.compileCreate(bp);
    expect(result.createTable).toContain("COMMENT 'it''s'");
  });

  it('emits foreign key as ALTER TABLE ADD CONSTRAINT', () => {
    const bp = new Blueprint('orders');
    bp.bigIncrements('id');
    bp.unsignedBigInteger('user_id');
    bp.foreign('user_id').references('id').on('users');
    const result = grammar.compileCreate(bp);
    expect(result.foreignKeys).toHaveLength(1);
    expect(result.foreignKeys[0]).toContain('ADD CONSTRAINT');
    expect(result.foreignKeys[0]).toContain('FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)');
  });

  it('throws FK without .on()', () => {
    const bp = new Blueprint('orders');
    bp.foreign('user_id').references('id');
    expect(() => grammar.compileCreate(bp)).toThrow(/reference a table/);
  });

  it('uses custom FK constraint name', () => {
    const bp = new Blueprint('orders');
    bp.bigIncrements('id');
    bp.unsignedBigInteger('user_id');
    bp.foreign('user_id').references('id').on('users').name('custom_fk');
    const result = grammar.compileCreate(bp);
    expect(result.foreignKeys[0]).toContain('`custom_fk`');
  });

  it('compiles primary key from index', () => {
    const bp = new Blueprint('t');
    bp.integer('a');
    bp.integer('b');
    bp.primary(['a', 'b']);
    const result = grammar.compileCreate(bp);
    expect(result.createTable).toContain('PRIMARY KEY (`a`, `b`)');
  });

  it('emits CREATE UNIQUE INDEX for unique index', () => {
    const bp = new Blueprint('t');
    bp.bigIncrements('id');
    bp.string('email');
    bp.unique('email');
    const result = grammar.compileCreate(bp);
    expect(result.indexes[0]).toContain('CREATE UNIQUE INDEX');
  });

  it('emits CREATE INDEX for plain index', () => {
    const bp = new Blueprint('t');
    bp.bigIncrements('id');
    bp.string('slug');
    bp.index('slug');
    const result = grammar.compileCreate(bp);
    expect(result.indexes[0]).toContain('CREATE INDEX');
  });

  it('compiles all basic types without error', () => {
    const bp = new Blueprint('all_types');
    bp.bigIncrements('id');
    bp.bigInteger('big');
    bp.integer('int');
    bp.smallInteger('small');
    bp.tinyInteger('tiny');
    bp.boolean('flag');
    bp.char('code', 2);
    bp.text('body');
    bp.mediumText('med');
    bp.longText('lng');
    bp.float('f');
    bp.double('d');
    bp.decimal('price', 10, 2);
    bp.uuid('uid');
    bp.ulid('ulid_col');
    bp.json('data');
    bp.jsonb('datab');
    bp.timestamp('ts');
    bp.timestampTz('tstz');
    bp.date('dt');
    bp.time('tm');
    bp.binary('blob_col');
    bp.enum('status', ['x']);
    const result = grammar.compileCreate(bp);
    expect(result.createTable).toBeDefined();
  });
});

describe('MySQLSchemaGrammar – compileAlter', () => {
  const grammar = new MySQLSchemaGrammar();

  it('emits ADD COLUMN', () => {
    const bp = new Blueprint('users');
    bp.string('bio');
    const result = grammar.compileAlter(bp);
    expect(result.alterTable![0]).toContain('ALTER TABLE `users` ADD COLUMN `bio`');
  });

  it('emits DROP COLUMN', () => {
    const bp = new Blueprint('users');
    bp.dropColumn('bio');
    const result = grammar.compileAlter(bp);
    expect(result.alterTable![0]).toContain('DROP COLUMN `bio`');
  });

  it('emits DROP INDEX', () => {
    const bp = new Blueprint('users');
    bp.dropIndex('idx_name');
    const result = grammar.compileAlter(bp);
    expect(result.alterTable![0]).toContain('DROP INDEX `idx_name`');
  });

  it('emits DROP FOREIGN KEY', () => {
    const bp = new Blueprint('orders');
    bp.dropForeign('fk_user');
    const result = grammar.compileAlter(bp);
    expect(result.alterTable![0]).toContain('DROP FOREIGN KEY `fk_user`');
  });
});

describe('MySQLSchemaGrammar – other methods', () => {
  const grammar = new MySQLSchemaGrammar();

  it('compileDrop()', () => {
    expect(grammar.compileDrop('users')).toBe('DROP TABLE `users`');
  });

  it('compileDropIfExists()', () => {
    expect(grammar.compileDropIfExists('users')).toBe('DROP TABLE IF EXISTS `users`');
  });

  it('compileTableExists() without schema', () => {
    const sql = grammar.compileTableExists('users');
    expect(sql).toContain('information_schema.tables');
    expect(sql).toContain('DATABASE()');
    expect(sql).toContain("'users'");
  });

  it('compileTableExists() with schema', () => {
    const sql = grammar.compileTableExists('users', 'mydb');
    expect(sql).toContain("'mydb'");
  });

  it('compileColumnListing() without schema', () => {
    const sql = grammar.compileColumnListing('users');
    expect(sql).toContain('information_schema.columns');
    expect(sql).toContain('DATABASE()');
  });

  it('compileColumnListing() with schema', () => {
    const sql = grammar.compileColumnListing('users', 'mydb');
    expect(sql).toContain("'mydb'");
  });

  it('wrap handles dotted identifiers', () => {
    const bp = new Blueprint('mydb.users');
    bp.bigIncrements('id');
    const result = grammar.compileCreate(bp);
    expect(result.createTable).toContain('`mydb`.`users`');
  });
});

// ── MariaDBSchemaGrammar ──────────────────────────────────────────────────────

describe('MariaDBSchemaGrammar – overrides', () => {
  const grammar = new MariaDBSchemaGrammar();

  it('inherits ENGINE=InnoDB from MySQL', () => {
    const bp = new Blueprint('users');
    bp.bigIncrements('id');
    const result = grammar.compileCreate(bp);
    expect(result.createTable).toContain('ENGINE=InnoDB');
  });

  it('uuid maps to native UUID type (not CHAR(36))', () => {
    const bp = new Blueprint('t');
    bp.uuid('uid');
    const result = grammar.compileCreate(bp);
    expect(result.createTable).toContain('UUID');
    expect(result.createTable).not.toContain('CHAR(36)');
  });

  it('jsonb maps to JSON (not JSONB)', () => {
    const bp = new Blueprint('t');
    bp.jsonb('data');
    const result = grammar.compileCreate(bp);
    expect(result.createTable).toContain('JSON');
  });

  it('json still maps to JSON', () => {
    const bp = new Blueprint('t');
    bp.json('meta');
    const result = grammar.compileCreate(bp);
    expect(result.createTable).toContain('JSON');
  });

  it('falls back to MySQL for non-overridden types', () => {
    const bp = new Blueprint('t');
    bp.increments('id');
    bp.string('name');
    bp.boolean('active');
    const result = grammar.compileCreate(bp);
    expect(result.createTable).toContain('INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY');
    expect(result.createTable).toContain('VARCHAR(255)');
    expect(result.createTable).toContain('TINYINT(1)');
  });

  it('compileTableExists() emits MariaDB-compatible query', () => {
    const sql = grammar.compileTableExists('orders');
    expect(sql).toContain('information_schema.tables');
    expect(sql).toContain("'orders'");
  });

  it('compileTableExists() with schema', () => {
    const sql = grammar.compileTableExists('orders', 'shop');
    expect(sql).toContain("'shop'");
  });

  it('compileCreate returns foreignKeys array', () => {
    const bp = new Blueprint('orders');
    bp.bigIncrements('id');
    bp.unsignedBigInteger('user_id');
    bp.foreign('user_id').references('id').on('users');
    const result = grammar.compileCreate(bp);
    expect(result.foreignKeys).toHaveLength(1);
    expect(result.foreignKeys[0]).toContain('FOREIGN KEY');
  });
});
