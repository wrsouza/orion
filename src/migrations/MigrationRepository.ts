import { Connection } from '../connection/Connection';

export interface MigrationRecord {
  id: number;
  migration: string;
  batch: number;
  run_at: Date;
}

export class MigrationRepository {
  private readonly table: string;

  constructor(
    private readonly connection: Connection,
    table = 'orion_migrations'
  ) {
    this.table = table;
  }

  async createRepository(): Promise<void> {
    const exists = await this.repositoryExists();
    if (exists) return;

    await this.connection.query(`
      CREATE TABLE "${this.table}" (
        "id"        BIGSERIAL PRIMARY KEY,
        "migration" VARCHAR(255) NOT NULL,
        "batch"     INTEGER NOT NULL,
        "run_at"    TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
  }

  async repositoryExists(): Promise<boolean> {
    const result = await this.connection.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = '${this.table}'
      ) AS "exists"
    `);
    return result.rows[0]?.['exists'] === true;
  }

  async getRan(): Promise<string[]> {
    const result = await this.connection.query(
      `SELECT "migration" FROM "${this.table}" ORDER BY "batch" ASC, "id" ASC`
    );
    return result.rows.map((r) => r['migration'] as string);
  }

  async getMigrations(steps: number): Promise<MigrationRecord[]> {
    const result = await this.connection.query(
      `SELECT * FROM "${this.table}" ORDER BY "batch" DESC, "id" DESC LIMIT $1`,
      [steps]
    );
    return result.rows as unknown as MigrationRecord[];
  }

  async getLastBatchNumber(): Promise<number> {
    const result = await this.connection.query(
      `SELECT MAX("batch") AS "batch" FROM "${this.table}"`
    );
    return (result.rows[0]?.['batch'] as number) ?? 0;
  }

  async getLastBatch(): Promise<MigrationRecord[]> {
    const batch = await this.getLastBatchNumber();
    const result = await this.connection.query(
      `SELECT * FROM "${this.table}" WHERE "batch" = $1 ORDER BY "id" DESC`,
      [batch]
    );
    return result.rows as unknown as MigrationRecord[];
  }

  async log(migration: string, batch: number): Promise<void> {
    await this.connection.query(
      `INSERT INTO "${this.table}" ("migration", "batch") VALUES ($1, $2)`,
      [migration, batch]
    );
  }

  async delete(migration: string): Promise<void> {
    await this.connection.query(`DELETE FROM "${this.table}" WHERE "migration" = $1`, [migration]);
  }

  async getAll(): Promise<MigrationRecord[]> {
    const result = await this.connection.query(
      `SELECT * FROM "${this.table}" ORDER BY "batch" ASC, "id" ASC`
    );
    return result.rows as unknown as MigrationRecord[];
  }
}
