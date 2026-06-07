/**
 * Integration tests for the migration system:
 *   - Migration (abstract base class)
 *   - MigrationRepository (tracking table CRUD)
 *   - Migrator (orchestration — filesystem-based)
 *
 * Design notes
 * ────────────
 * MigrationRepository ships with PostgreSQL-flavoured DDL and uses $1/$2 …
 * parameter placeholders in its INSERT/DELETE/SELECT queries.  The in-process
 * SQLite adapter (better-sqlite3) expects ? positional placeholders, not $N.
 *
 * We solve this with a thin `SqliteCompatConnection` wrapper that:
 *   1. Rewrites $1, $2, … → ? before handing the query to the real adapter.
 *   2. Creates the migrations tracking table with SQLite-compatible DDL
 *      (INTEGER PRIMARY KEY AUTOINCREMENT instead of BIGSERIAL, etc.).
 *
 * For Migrator (which loads migration files via require()), we bypass the
 * file-loading `resolve()` method entirely by monkey-patching a private helper
 * so we can supply in-memory Migration instances.  This avoids the need to
 * write temp TypeScript files that vitest's vite transformer cannot reach via
 * a synchronous require() call.
 */

import { ConnectionManager } from '../../src/connection/ConnectionManager';
import { Schema } from '../../src/schema/Schema';
import { SQLiteSchemaGrammar } from '../../src/schema/grammars/SQLiteSchemaGrammar';
import { Migration } from '../../src/migrations/Migration';
import { MigrationRepository } from '../../src/migrations/MigrationRepository';
import { Migrator } from '../../src/migrations/Migrator';
import type { Connection, QueryResult } from '../../src/connection/Connection';
import type { QueryGrammar } from '../../src/query/grammars/QueryGrammar';

// ── Connection name ────────────────────────────────────────────────────────

const CONN = 'schema';

// ── SQLite-compatible connection wrapper ──────────────────────────────────

/**
 * Wraps the real SQLite connection and rewrites PostgreSQL-style $1/$2/…
 * positional placeholders to ? so that better-sqlite3 can handle them.
 */
class SqliteCompatConnection implements Connection {
  constructor(private readonly inner: Connection) {}

  private rewrite(sql: string): string {
    // Replace $1, $2, … with ? (better-sqlite3 uses ? for positional params)
    return sql.replace(/\$\d+/g, '?');
  }

  async query(sql: string, bindings?: unknown[]): Promise<QueryResult> {
    return this.inner.query(this.rewrite(sql), bindings);
  }

  async transaction<T>(callback: (conn: Connection) => Promise<T>): Promise<T> {
    return this.inner.transaction((innerConn) => {
      const wrapped = new SqliteCompatConnection(innerConn);
      return callback(wrapped);
    });
  }

  async disconnect(): Promise<void> {
    return this.inner.disconnect();
  }

  isConnected(): boolean {
    return this.inner.isConnected();
  }

  getGrammar(): QueryGrammar {
    return this.inner.getGrammar();
  }
}

// ── SQLite-compatible DDL for the migrations tracking table ───────────────

function makeRepoTableDDL(table: string): string {
  return `
    CREATE TABLE IF NOT EXISTS "${table}" (
      "id"        INTEGER PRIMARY KEY AUTOINCREMENT,
      "migration" VARCHAR(255) NOT NULL,
      "batch"     INTEGER NOT NULL,
      "run_at"    TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `;
}

// ── Setup / teardown ──────────────────────────────────────────────────────

beforeAll(async () => {
  ConnectionManager.addConnection(CONN, { driver: 'sqlite', filename: ':memory:' });
  Schema.useGrammar(new SQLiteSchemaGrammar());
});

afterAll(async () => {
  await ConnectionManager.getConnection(CONN).disconnect();
});

// ═══════════════════════════════════════════════════════════════════════════
// Migration (abstract base class)
// ═══════════════════════════════════════════════════════════════════════════

describe('Migration base class', () => {
  /** Concrete migration that creates / drops a test table via Schema. */
  class CreateTestTable extends Migration {
    async up(): Promise<void> {
      await this.Schema.create(
        'migration_test_table',
        (t) => {
          t.id();
          t.string('label');
        },
        CONN,
      );
    }

    async down(): Promise<void> {
      await this.Schema.dropIfExists('migration_test_table', CONN);
    }
  }

  beforeEach(async () => {
    // Drop if left over
    await Schema.dropIfExists('migration_test_table', CONN);
  });

  it('exposes Schema and Blueprint as protected properties', () => {
    const m = new CreateTestTable();
    expect((m as any).Schema).toBe(Schema);
    expect((m as any).Blueprint).toBeDefined();
  });

  it('up() creates the target table without throwing', async () => {
    const m = new CreateTestTable();
    await expect(m.up()).resolves.toBeUndefined();
  });

  it('down() drops the table created by up() without throwing', async () => {
    const m = new CreateTestTable();
    await m.up();
    await expect(m.down()).resolves.toBeUndefined();
  });

  it('concrete subclass satisfies the Migration contract', () => {
    const m = new CreateTestTable();
    expect(typeof m.up).toBe('function');
    expect(typeof m.down).toBe('function');
    expect(m).toBeInstanceOf(Migration);
  });

  it('up() followed by down() leaves no table behind — up() can run again', async () => {
    const m = new CreateTestTable();
    await m.up();
    await m.down();
    await expect(m.up()).resolves.toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MigrationRepository
// ═══════════════════════════════════════════════════════════════════════════

describe('MigrationRepository', () => {
  const TABLE = 'orion_migrations_repo_tests';
  let repo: MigrationRepository;
  let compat: SqliteCompatConnection;

  beforeAll(async () => {
    const raw = ConnectionManager.getConnection(CONN);
    compat = new SqliteCompatConnection(raw);
    await compat.query(makeRepoTableDDL(TABLE));
    repo = new MigrationRepository(compat, TABLE);
  });

  afterEach(async () => {
    await compat.query(`DELETE FROM "${TABLE}"`);
  });

  // ── getRan ──────────────────────────────────────────────────────────────

  it('getRan() returns an empty array when no migrations have been logged', async () => {
    expect(await repo.getRan()).toEqual([]);
  });

  it('getRan() returns migration names ordered by batch then id', async () => {
    await repo.log('2024_01_create_users', 1);
    await repo.log('2024_02_create_posts', 1);
    await repo.log('2024_03_create_comments', 2);

    expect(await repo.getRan()).toEqual([
      '2024_01_create_users',
      '2024_02_create_posts',
      '2024_03_create_comments',
    ]);
  });

  // ── log ─────────────────────────────────────────────────────────────────

  it('log() inserts a migration record that appears in getRan()', async () => {
    await repo.log('mig_logged', 1);
    expect(await repo.getRan()).toContain('mig_logged');
  });

  it('log() stores the correct batch number', async () => {
    await repo.log('mig_a', 3);
    const all = await repo.getAll();
    expect(all[0].migration).toBe('mig_a');
    expect(all[0].batch).toBe(3);
  });

  // ── getLastBatchNumber ───────────────────────────────────────────────────

  it('getLastBatchNumber() returns 0 when no migrations have been logged', async () => {
    expect(await repo.getLastBatchNumber()).toBe(0);
  });

  it('getLastBatchNumber() returns the highest batch number present', async () => {
    await repo.log('mig_1', 1);
    await repo.log('mig_2', 2);
    await repo.log('mig_3', 3);
    expect(await repo.getLastBatchNumber()).toBe(3);
  });

  it('next batch number is getLastBatchNumber() + 1', async () => {
    await repo.log('mig_1', 1);
    await repo.log('mig_2', 2);
    expect((await repo.getLastBatchNumber()) + 1).toBe(3);
  });

  // ── getLastBatch ─────────────────────────────────────────────────────────

  it('getLastBatch() returns an empty array when there are no migrations', async () => {
    expect(await repo.getLastBatch()).toHaveLength(0);
  });

  it('getLastBatch() returns only records for the most recent batch', async () => {
    await repo.log('mig_a', 1);
    await repo.log('mig_b', 2);
    await repo.log('mig_c', 2);

    const last = await repo.getLastBatch();
    expect(last).toHaveLength(2);
    const names = last.map((r) => r.migration);
    expect(names).toContain('mig_b');
    expect(names).toContain('mig_c');
    expect(names).not.toContain('mig_a');
  });

  // ── getMigrations ────────────────────────────────────────────────────────

  it('getMigrations(n) returns the last n records ordered by batch DESC, id DESC', async () => {
    await repo.log('mig_1', 1);
    await repo.log('mig_2', 2);
    await repo.log('mig_3', 3);

    const records = await repo.getMigrations(2);
    expect(records).toHaveLength(2);
    expect(records[0].migration).toBe('mig_3');
    expect(records[1].migration).toBe('mig_2');
  });

  it('getMigrations(1) returns only the single most recent record', async () => {
    await repo.log('mig_x', 1);
    await repo.log('mig_y', 2);

    const records = await repo.getMigrations(1);
    expect(records).toHaveLength(1);
    expect(records[0].migration).toBe('mig_y');
  });

  // ── delete ───────────────────────────────────────────────────────────────

  it('delete() removes a migration record by name', async () => {
    await repo.log('mig_x', 1);
    await repo.log('mig_y', 1);

    await repo.delete('mig_x');

    const ran = await repo.getRan();
    expect(ran).not.toContain('mig_x');
    expect(ran).toContain('mig_y');
  });

  it('delete() is a no-op when the migration name does not exist', async () => {
    await repo.log('mig_a', 1);
    await expect(repo.delete('nonexistent')).resolves.toBeUndefined();
    expect(await repo.getRan()).toContain('mig_a');
  });

  // ── getAll ───────────────────────────────────────────────────────────────

  it('getAll() returns an empty array when there are no records', async () => {
    expect(await repo.getAll()).toEqual([]);
  });

  it('getAll() returns all records ordered by batch ASC, id ASC', async () => {
    await repo.log('mig_first', 1);
    await repo.log('mig_second', 2);
    await repo.log('mig_third', 1);

    const all = await repo.getAll();
    expect(all).toHaveLength(3);
    expect(all[0].batch).toBe(1);
    expect(all[2].batch).toBe(2);
  });

  it('getAll() records have the expected shape (id, migration, batch)', async () => {
    await repo.log('mig_shape', 5);
    const all = await repo.getAll();
    expect(all[0]).toHaveProperty('id');
    expect(all[0]).toHaveProperty('migration', 'mig_shape');
    expect(all[0]).toHaveProperty('batch', 5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Migrator (filesystem-based orchestrator)
// ═══════════════════════════════════════════════════════════════════════════

describe('Migrator', () => {
  /**
   * Build a Migrator backed by a fresh SQLite-compat tracking table.
   * We patch `createRepository` (PG-specific DDL) to a no-op and
   * patch `resolve` (filesystem + require) to return in-memory Migration
   * instances keyed by name so we can test the full orchestration logic
   * without touching the filesystem.
   *
   * @param migrations  Map of migration name → Migration instance
   * @param tableSuffix Unique suffix to avoid cross-test table collisions
   */
  async function buildMigrator(
    migrations: Record<string, Migration>,
    tableSuffix: string,
  ): Promise<Migrator> {
    const raw = ConnectionManager.getConnection(CONN);
    const compat = new SqliteCompatConnection(raw);
    const repoTable = `orion_mig_${tableSuffix}`;
    await compat.query(makeRepoTableDDL(repoTable));

    // Migrator needs a path; we pass a dummy because getMigrationFiles() is also patched
    const m = new Migrator({
      migrationsPath: '/dummy',
      connection: compat,
      repositoryTable: repoTable,
    });

    // Patch createRepository — the SQLite table already exists
    (m as any).repo.createRepository = async () => {};

    // Patch getMigrationFiles to return sorted fake "file" paths
    const names = Object.keys(migrations).sort();
    (m as any).getMigrationFiles = () => names.map((n) => `/dummy/${n}.ts`);

    // Patch getMigrationName to strip the prefix we added
    (m as any).getMigrationName = (file: string) =>
      file.replace(/^.*[\\/]/, '').replace(/\.(ts|js)$/, '');

    // Patch findFileForMigration as well
    (m as any).findFileForMigration = (migName: string) =>
      names.includes(migName) ? `/dummy/${migName}.ts` : undefined;

    // Patch resolve to return the in-memory instance
    (m as any).resolve = async (file: string) => {
      const name = file.replace(/^.*[\\/]/, '').replace(/\.(ts|js)$/, '');
      const instance = migrations[name];
      if (!instance) throw new Error(`No migration registered for "${name}"`);
      return instance;
    };

    return m;
  }

  /** Simple concrete Migration whose up/down track call counts. */
  function makeMigration(tableName: string): Migration & { upCalls: number; downCalls: number } {
    class TestMigration extends Migration {
      upCalls = 0;
      downCalls = 0;

      async up(): Promise<void> {
        this.upCalls++;
        await this.Schema.create(tableName, (t) => { t.id(); t.string('v'); }, CONN);
      }

      async down(): Promise<void> {
        this.downCalls++;
        await this.Schema.dropIfExists(tableName, CONN);
      }
    }
    return new TestMigration() as any;
  }

  // ── status() with no files ────────────────────────────────────────────

  it('status() returns an empty array when there are no migration files', async () => {
    const m = await buildMigrator({}, `status_empty_${Date.now()}`);
    expect(await m.status()).toEqual([]);
  });

  // ── rollback() with no records ────────────────────────────────────────

  it('rollback() returns an empty array when nothing has been run', async () => {
    const m = await buildMigrator({}, `rb_empty_${Date.now()}`);
    expect(await m.rollback()).toEqual([]);
  });

  // ── reset() with no records ───────────────────────────────────────────

  it('reset() returns an empty array when nothing has been run', async () => {
    const m = await buildMigrator({}, `rst_empty_${Date.now()}`);
    expect(await m.reset()).toEqual([]);
  });

  // ── run() pending migrations ──────────────────────────────────────────

  it('run() executes up() on each pending migration and logs them', async () => {
    const mig1 = makeMigration('migrator_run_tbl1');
    const mig2 = makeMigration('migrator_run_tbl2');

    // Ensure clean state
    await Schema.dropIfExists('migrator_run_tbl1', CONN);
    await Schema.dropIfExists('migrator_run_tbl2', CONN);

    const m = await buildMigrator(
      { '2024_01_mig_a': mig1, '2024_02_mig_b': mig2 },
      `run_${Date.now()}`,
    );

    const executed = await m.run();

    expect(executed).toHaveLength(2);
    expect(executed).toContain('2024_01_mig_a');
    expect(executed).toContain('2024_02_mig_b');
    expect(mig1.upCalls).toBe(1);
    expect(mig2.upCalls).toBe(1);
  });

  // ── second run() is a no-op ───────────────────────────────────────────

  it('run() returns an empty array on second call (all already ran)', async () => {
    const mig1 = makeMigration('migrator_noop_tbl1');
    await Schema.dropIfExists('migrator_noop_tbl1', CONN);

    const m = await buildMigrator({ '2024_01_noop': mig1 }, `noop_${Date.now()}`);

    await m.run();
    const executed2 = await m.run();
    expect(executed2).toEqual([]);
    expect(mig1.upCalls).toBe(1); // still only called once
  });

  // ── status() after run() ──────────────────────────────────────────────

  it('status() reports all migrations as ran after run()', async () => {
    const mig1 = makeMigration('migrator_status_tbl1');
    const mig2 = makeMigration('migrator_status_tbl2');
    await Schema.dropIfExists('migrator_status_tbl1', CONN);
    await Schema.dropIfExists('migrator_status_tbl2', CONN);

    const m = await buildMigrator(
      { '2024_01_s_mig_a': mig1, '2024_02_s_mig_b': mig2 },
      `status_ran_${Date.now()}`,
    );

    await m.run();
    const statuses = await m.status();

    expect(statuses).toHaveLength(2);
    expect(statuses.every((s) => s.ran)).toBe(true);
    expect(statuses.every((s) => s.batch === 1)).toBe(true);
  });

  // ── rollback() ────────────────────────────────────────────────────────

  it('rollback(n) calls down() and removes from the repository', async () => {
    const mig1 = makeMigration('migrator_rb_tbl1');
    const mig2 = makeMigration('migrator_rb_tbl2');
    await Schema.dropIfExists('migrator_rb_tbl1', CONN);
    await Schema.dropIfExists('migrator_rb_tbl2', CONN);

    const m = await buildMigrator(
      { '2024_01_rb_a': mig1, '2024_02_rb_b': mig2 },
      `rollback_${Date.now()}`,
    );

    await m.run();
    const rolled = await m.rollback(2);

    expect(rolled).toHaveLength(2);
    expect(mig1.downCalls).toBe(1);
    expect(mig2.downCalls).toBe(1);

    const statuses = await m.status();
    expect(statuses.every((s) => !s.ran)).toBe(true);
  });

  // ── reset() ───────────────────────────────────────────────────────────

  it('reset() calls down() on all migrations and clears the repository', async () => {
    const mig1 = makeMigration('migrator_reset_tbl1');
    const mig2 = makeMigration('migrator_reset_tbl2');
    await Schema.dropIfExists('migrator_reset_tbl1', CONN);
    await Schema.dropIfExists('migrator_reset_tbl2', CONN);

    const m = await buildMigrator(
      { '2024_01_res_a': mig1, '2024_02_res_b': mig2 },
      `reset_${Date.now()}`,
    );

    await m.run();
    const resetted = await m.reset();

    expect(resetted).toHaveLength(2);
    expect(mig1.downCalls).toBe(1);
    expect(mig2.downCalls).toBe(1);

    const ran = await (m as any).repo.getRan();
    expect(ran).toHaveLength(0);
  });

  // ── rollback() error when file is missing ────────────────────────────

  it('rollback() throws when a migration file cannot be found', async () => {
    const mig1 = makeMigration('migrator_missing_tbl1');
    await Schema.dropIfExists('migrator_missing_tbl1', CONN);

    const m = await buildMigrator(
      { '2024_01_missing': mig1 },
      `missing_${Date.now()}`,
    );

    await m.run();

    // Remove the migration from the known set so findFileForMigration returns undefined
    (m as any).findFileForMigration = () => undefined;

    await expect(m.rollback(1)).rejects.toThrow('[orion]');
  });
});
