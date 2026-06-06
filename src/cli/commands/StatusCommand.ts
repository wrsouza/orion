import { ConnectionManager } from '../../connection/ConnectionManager';
import { Migrator } from '../../migrations/Migrator';
import { OrmConfig, resolveMigrationsPath } from '../utils/config';
import { bold, cyan, dim, gray, green, red, yellow } from '../utils/colors';

export async function statusCommand(config: OrmConfig): Promise<void> {
  const migrationsPath = resolveMigrationsPath(config);

  ConnectionManager.addConnection('default', config.connection);
  const connection = ConnectionManager.getConnection('default');

  const migrator = new Migrator({
    migrationsPath,
    connection,
    repositoryTable: config.migrations.table,
  });

  let statuses;

  try {
    statuses = await migrator.status();
  } catch (err) {
    console.error(red(`  ERROR: ${(err as Error).message}`));
    process.exit(1);
  } finally {
    await ConnectionManager.disconnectAll();
  }

  if (statuses.length === 0) {
    console.log(gray('\n  No migration files found.\n'));
    return;
  }

  const maxLen = Math.max(...statuses.map((s) => s.name.length));

  console.log(cyan(bold('\n  Migration Status\n')));
  console.log(`  ${bold('Status'.padEnd(8))}  ${bold('Batch'.padEnd(7))}  ${bold('Migration')}`);
  console.log(`  ${'─'.repeat(maxLen + 20)}`);

  for (const s of statuses) {
    const status = s.ran ? green('Ran     ') : yellow('Pending ');
    const batch = s.batch !== null ? String(s.batch).padEnd(7) : dim('  -    ');
    console.log(`  ${status}  ${batch}  ${s.name}`);
  }

  const pending = statuses.filter((s) => !s.ran).length;
  const ran = statuses.filter((s) => s.ran).length;

  console.log(
    `\n  ${dim(`${ran} ran`)}  ${pending > 0 ? yellow(`${pending} pending`) : dim('0 pending')}\n`
  );
}
