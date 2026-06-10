import { ConnectionManager } from '../../connection/ConnectionManager';
import { Migrator } from '../../migrations/Migrator';
import { OrmConfig, resolveMigrationsPath } from '../utils/config';
import { bold, cyan, dim, gray, red, yellow } from '../utils/colors';

export async function rollbackCommand(config: OrmConfig, steps = 1): Promise<void> {
  const migrationsPath = resolveMigrationsPath(config);

  ConnectionManager.addConnection(config.name, config.connection);
  const connection = ConnectionManager.getConnection(config.name);

  const migrator = new Migrator({
    migrationsPath,
    connection,
    repositoryTable: config.migrations.table,
  });

  console.log(cyan(bold(`\n  Rolling back ${steps} batch(es)...\n`)));

  let rolled: string[];

  try {
    rolled = await migrator.rollback(steps);
  } catch (err) {
    console.error(red(`  ERROR: ${(err as Error).message}`));
    process.exit(1);
  } finally {
    await ConnectionManager.disconnectAll();
  }

  if (rolled.length === 0) {
    console.log(gray('  Nothing to rollback.\n'));
    return;
  }

  for (const name of rolled) {
    console.log(`  ${yellow('↩')} ${name}`);
  }

  console.log(dim(`\n  ${rolled.length} migration(s) rolled back.\n`));
}
