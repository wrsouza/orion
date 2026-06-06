import { ConnectionManager } from '../../connection/ConnectionManager';
import { Migrator } from '../../migrations/Migrator';
import { OrmConfig, resolveMigrationsPath } from '../utils/config';
import { bold, cyan, dim, gray, green, red } from '../utils/colors';

export async function migrateCommand(config: OrmConfig): Promise<void> {
  const migrationsPath = resolveMigrationsPath(config);

  ConnectionManager.addConnection('default', config.connection);
  const connection = ConnectionManager.getConnection('default');

  const migrator = new Migrator({
    migrationsPath,
    connection,
    repositoryTable: config.migrations.table,
  });

  console.log(cyan(bold('\n  Running migrations...\n')));

  let executed: string[];

  try {
    executed = await migrator.run();
  } catch (err) {
    console.error(red(`  ERROR: ${(err as Error).message}`));
    process.exit(1);
  } finally {
    await ConnectionManager.disconnectAll();
  }

  if (executed.length === 0) {
    console.log(gray('  Nothing to migrate. All migrations are up to date.\n'));
    return;
  }

  for (const name of executed) {
    console.log(`  ${green('✓')} ${name}`);
  }

  console.log(dim(`\n  ${executed.length} migration(s) run.\n`));
}
