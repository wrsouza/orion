#!/usr/bin/env node

import './bootstrap'; // must be first — auto-registers ts-node before any require()
import { loadConfig } from './utils/config';
import { bold, cyan, red } from './utils/colors';

const COMMANDS = [
  'migrate',
  'migrate:rollback',
  'migrate:reset',
  'migrate:status',
  'make:migration',
  'model:prune',
];

function printHelp(): void {
  console.log(`
${cyan(bold('orion'))} — Eloquent-style ORM for TypeScript

${bold('Usage:')}
  orion <command> [options]

${bold('Commands:')}
  ${cyan('migrate')}                   Run all pending migrations
  ${cyan('migrate:rollback')} [--step=N]  Rollback the last N batches (default: 1)
  ${cyan('migrate:reset')}             Rollback all migrations
  ${cyan('migrate:status')}            Show the status of each migration
  ${cyan('make:migration')} <name>     Create a new migration file
  ${cyan('model:prune')} [--model=X] [--chunk=N]  Delete prunable records

${bold('Options:')}
  ${cyan('--config')} <path>           Path to config file (optional)

${bold('Config — recommended (src/database.ts):')}
  import { createConnection } from '@wrsouza/orion';

  export default createConnection({
    connection: process.env.DATABASE_URL,
    migrations: { path: './src/database/migrations' },
  });

${bold('Config — legacy (orion.config.js):')}
  module.exports = {
    connection: { driver: 'postgres', host: 'localhost', database: 'mydb',
                  user: 'postgres', password: 'secret' },
    migrations: { path: './database/migrations' },
  };

${bold('Auto-detected paths (in order):')}
  orion.config.ts  |  orion.config.js  |  src/database.ts  |  database.ts
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // --config <path> or --config=<path>
  const configFlagIndex = args.findIndex((a) => a === '--config' || a.startsWith('--config='));
  let configPath: string | undefined;
  if (configFlagIndex !== -1) {
    if (args[configFlagIndex].includes('=')) {
      configPath = args[configFlagIndex].split('=')[1];
    } else {
      configPath = args[configFlagIndex + 1];
      args.splice(configFlagIndex, 2);
    }
    if (configFlagIndex !== -1 && !configPath?.includes('=')) {
      args.splice(configFlagIndex, 1);
    }
  }

  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    printHelp();
    process.exit(0);
  }

  if (!COMMANDS.includes(command)) {
    console.error(red(`\n  Unknown command: "${command}"\n`));
    printHelp();
    process.exit(1);
  }

  let config;
  try {
    config = loadConfig(process.cwd(), configPath);
  } catch (err) {
    console.error(red(`\n  ${(err as Error).message}\n`));
    process.exit(1);
  }

  // Parse flags
  const stepFlag = args.find((a) => a.startsWith('--step='));
  const steps = stepFlag ? parseInt(stepFlag.split('=')[1], 10) : 1;

  switch (command) {
    case 'migrate': {
      const { migrateCommand } = await import('./commands/MigrateCommand');
      await migrateCommand(config);
      break;
    }

    case 'migrate:rollback': {
      const { rollbackCommand } = await import('./commands/RollbackCommand');
      await rollbackCommand(config, steps);
      break;
    }

    case 'migrate:reset': {
      const { rollbackCommand } = await import('./commands/RollbackCommand');
      // Reset = rollback all; we pass a large number
      await rollbackCommand(config, 9999);
      break;
    }

    case 'migrate:status': {
      const { statusCommand } = await import('./commands/StatusCommand');
      await statusCommand(config);
      break;
    }

    case 'make:migration': {
      const migrationName = args.slice(1).join(' ');
      const { makeMigrationCommand } = await import('./commands/MakeMigrationCommand');
      await makeMigrationCommand(config, migrationName);
      break;
    }

    case 'model:prune': {
      const modelFlag = args.find((a) => a.startsWith('--model='));
      const chunkFlag = args.find((a) => a.startsWith('--chunk='));
      const { pruneCommand } = await import('./commands/PruneCommand');
      await pruneCommand(config, {
        model: modelFlag ? modelFlag.split('=')[1] : undefined,
        chunk: chunkFlag ? parseInt(chunkFlag.split('=')[1], 10) : undefined,
      });
      break;
    }
  }
}

main().catch((err) => {
  console.error(red(`\n  Fatal error: ${err.message}\n`));
  process.exit(1);
});
