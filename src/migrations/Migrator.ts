import * as fs from 'fs';
import * as path from 'path';
import { Connection } from '../connection/Connection';
import { Migration } from './Migration';
import { MigrationRepository } from './MigrationRepository';

export interface MigratorOptions {
  migrationsPath: string;
  connection: Connection;
  repositoryTable?: string;
}

export interface MigrationStatus {
  name: string;
  ran: boolean;
  batch: number | null;
}

/**
 * Orchestrates the execution and tracking of database migrations.
 *
 * Migration files are discovered from `migrationsPath`, sorted lexicographically
 * (timestamp prefix ensures correct order), and executed against the provided
 * connection. State is persisted in a control table managed by `MigrationRepository`.
 */
export class Migrator {
  private readonly repo: MigrationRepository;
  private readonly migrationsPath: string;
  private readonly connection: Connection;

  constructor(options: MigratorOptions) {
    this.migrationsPath = options.migrationsPath;
    this.connection = options.connection;
    this.repo = new MigrationRepository(options.connection, options.repositoryTable);
  }

  // ── Run all pending migrations ────────────────────────────────────────────

  async run(): Promise<string[]> {
    await this.repo.createRepository();

    const ran = await this.repo.getRan();
    const files = this.getMigrationFiles();
    const pending = files.filter((f) => !ran.includes(this.getMigrationName(f)));

    if (pending.length === 0) {
      return [];
    }

    const batch = (await this.repo.getLastBatchNumber()) + 1;
    const executed: string[] = [];

    for (const file of pending) {
      const name = this.getMigrationName(file);
      const migration = await this.resolve(file);

      await migration.up();
      await this.repo.log(name, batch);
      executed.push(name);
    }

    return executed;
  }

  // ── Rollback last batch (or N steps) ─────────────────────────────────────

  async rollback(steps = 1): Promise<string[]> {
    await this.repo.createRepository();

    const records = await this.repo.getMigrations(steps);

    if (records.length === 0) {
      return [];
    }

    const rolled: string[] = [];

    for (const record of records) {
      const file = this.findFileForMigration(record.migration);
      if (!file) {
        throw new Error(`[orion] Migration file not found for: ${record.migration}`);
      }

      const migration = await this.resolve(file);
      await migration.down();
      await this.repo.delete(record.migration);
      rolled.push(record.migration);
    }

    return rolled;
  }

  // ── Reset all migrations ──────────────────────────────────────────────────

  async reset(): Promise<string[]> {
    await this.repo.createRepository();

    const all = await this.repo.getAll();
    const reversed = [...all].reverse();
    const rolled: string[] = [];

    for (const record of reversed) {
      const file = this.findFileForMigration(record.migration);
      if (!file) {
        throw new Error(`[orion] Migration file not found for: ${record.migration}`);
      }
      const migration = await this.resolve(file);
      await migration.down();
      await this.repo.delete(record.migration);
      rolled.push(record.migration);
    }

    return rolled;
  }

  // ── Status ────────────────────────────────────────────────────────────────

  async status(): Promise<MigrationStatus[]> {
    await this.repo.createRepository();

    const files = this.getMigrationFiles();
    const records = await this.repo.getAll();
    const ranMap = new Map(records.map((r) => [r.migration, r.batch]));

    return files.map((file) => {
      const name = this.getMigrationName(file);
      const batch = ranMap.get(name) ?? null;
      return { name, ran: batch !== null, batch };
    });
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private getMigrationFiles(): string[] {
    if (!fs.existsSync(this.migrationsPath)) {
      return [];
    }

    return fs
      .readdirSync(this.migrationsPath)
      .filter((f) => f.endsWith('.ts') || f.endsWith('.js'))
      .sort()
      .map((f) => path.join(this.migrationsPath, f));
  }

  private getMigrationName(file: string): string {
    return path.basename(file).replace(/\.(ts|js)$/, '');
  }

  private findFileForMigration(migrationName: string): string | undefined {
    const files = this.getMigrationFiles();
    return files.find((f) => this.getMigrationName(f) === migrationName);
  }

  private async resolve(file: string): Promise<Migration> {
    const module = require(file);
    const MigrationClass = module.default ?? Object.values(module)[0];

    if (typeof MigrationClass !== 'function') {
      throw new Error(`[orion] Migration file "${file}" must export a class as default export.`);
    }

    return new (MigrationClass as new () => Migration)();
  }
}
