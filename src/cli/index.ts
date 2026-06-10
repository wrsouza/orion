#!/usr/bin/env node

import './bootstrap'; // must be first — auto-registers ts-node before any require()
import { loadConfig, OrmConfig } from './utils/config';
import { bold, cyan, red, dim } from './utils/colors';

const COMMANDS = [
  'migrate',
  'migrate:rollback',
  'migrate:reset',
  'migrate:status',
  'make:migration',
  'model:prune',
  'db:seed',
  'make:seed',
  'make:factory',
];

function printHelp(): void {
  console.log(`
${cyan(bold('orion'))} — Eloquent-style ORM for TypeScript

${bold('Usage:')}
  orion <command> [options]

${bold('Commands:')}
  ${cyan('migrate')}                        Run all pending migrations
  ${cyan('migrate:rollback')} [--step=N]       Rollback the last N batches (default: 1)
  ${cyan('migrate:reset')}                  Rollback all migrations
  ${cyan('migrate:status')}                 Show the status of each migration
  ${cyan('make:migration')} <name>          Create a new migration file
  ${cyan('model:prune')} [--model=X] [--chunk=N]  Delete prunable records

  ${cyan('db:seed')} [--class=SeederName]   Run seeders (default: DatabaseSeeder)
  ${cyan('make:seed')} <name>               Create a new seeder file
  ${cyan('make:factory')} <name>            Create a new factory file

${bold('Options:')}
  ${cyan('--config')} <path>               Path to config file (optional)
  ${cyan('--connection')} <name>           Target a specific connection (default: 'default')
  ${cyan('--all')}                         Run on all configured connections
`);
}

function selectConfigs(
  configs: OrmConfig[],
  connectionName: string | undefined,
  all: boolean
): OrmConfig[] {
  if (all) return configs;
  const name = connectionName ?? 'default';
  const found = configs.find((c) => c.name === name);
  if (!found) {
    const available = configs.map((c) => `'${c.name}'`).join(', ');
    throw new Error(`[orion] Connection '${name}' not found. Available: ${available}`);
  }
  return [found];
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

  // --connection <name> or --connection=<name>
  const connFlagIndex = args.findIndex(
    (a) => a === '--connection' || a.startsWith('--connection=')
  );
  let connectionName: string | undefined;
  if (connFlagIndex !== -1) {
    if (args[connFlagIndex].includes('=')) {
      connectionName = args[connFlagIndex].split('=')[1];
      args.splice(connFlagIndex, 1);
    } else {
      connectionName = args[connFlagIndex + 1];
      args.splice(connFlagIndex, 2);
    }
  }

  // --all
  const allFlagIndex = args.indexOf('--all');
  const runAll = allFlagIndex !== -1;
  if (runAll) args.splice(allFlagIndex, 1);

  if (connectionName && runAll) {
    console.error(red('\n  Cannot use --connection and --all together.\n'));
    process.exit(1);
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

  let allConfigs: OrmConfig[];
  try {
    allConfigs = loadConfig(process.cwd(), configPath);
  } catch (err) {
    console.error(red(`\n  ${(err as Error).message}\n`));
    process.exit(1);
  }

  // Parse flags
  const stepFlag = args.find((a) => a.startsWith('--step='));
  const steps = stepFlag ? parseInt(stepFlag.split('=')[1], 10) : 1;

  // Commands that are connection-aware (migrations)
  const connectionAwareCommands = [
    'migrate',
    'migrate:rollback',
    'migrate:reset',
    'migrate:status',
    'make:migration',
  ];

  // For connection-aware commands, resolve which configs to target
  let targetConfigs: OrmConfig[];
  if (connectionAwareCommands.includes(command)) {
    try {
      targetConfigs = selectConfigs(allConfigs, connectionName, runAll);
    } catch (err) {
      console.error(red(`\n  ${(err as Error).message}\n`));
      process.exit(1);
    }
  } else {
    // Seed / factory / prune commands always use the default connection
    targetConfigs = [allConfigs.find((c) => c.name === 'default') ?? allConfigs[0]];
  }

  switch (command) {
    case 'migrate': {
      const { migrateCommand } = await import('./commands/MigrateCommand');
      for (const cfg of targetConfigs) {
        if (targetConfigs.length > 1) console.log(dim(`\n  ── ${cfg.name} ──`));
        await migrateCommand(cfg);
      }
      break;
    }

    case 'migrate:rollback': {
      const { rollbackCommand } = await import('./commands/RollbackCommand');
      for (const cfg of targetConfigs) {
        if (targetConfigs.length > 1) console.log(dim(`\n  ── ${cfg.name} ──`));
        await rollbackCommand(cfg, steps);
      }
      break;
    }

    case 'migrate:reset': {
      const { rollbackCommand } = await import('./commands/RollbackCommand');
      for (const cfg of targetConfigs) {
        if (targetConfigs.length > 1) console.log(dim(`\n  ── ${cfg.name} ──`));
        await rollbackCommand(cfg, 9999);
      }
      break;
    }

    case 'migrate:status': {
      const { statusCommand } = await import('./commands/StatusCommand');
      for (const cfg of targetConfigs) {
        if (targetConfigs.length > 1) console.log(dim(`\n  ── ${cfg.name} ──`));
        await statusCommand(cfg);
      }
      break;
    }

    case 'make:migration': {
      const migrationName = args.slice(1).join(' ');
      const config = targetConfigs[0];
      const { makeMigrationCommand } = await import('./commands/MakeMigrationCommand');
      await makeMigrationCommand(config, migrationName);
      break;
    }

    case 'model:prune': {
      const modelFlag = args.find((a) => a.startsWith('--model='));
      const chunkFlag = args.find((a) => a.startsWith('--chunk='));
      const { pruneCommand } = await import('./commands/PruneCommand');
      await pruneCommand(targetConfigs[0], {
        model: modelFlag ? modelFlag.split('=')[1] : undefined,
        chunk: chunkFlag ? parseInt(chunkFlag.split('=')[1], 10) : undefined,
      });
      break;
    }

    case 'db:seed': {
      const classFlag = args.find((a) => a.startsWith('--class='));
      const seederClass = classFlag ? classFlag.split('=')[1] : undefined;
      const { seedCommand } = await import('./commands/SeedCommand');
      await seedCommand(targetConfigs[0], seederClass);
      break;
    }

    case 'make:seed': {
      const seederName = args.slice(1).join(' ');
      const { makeSeederCommand } = await import('./commands/MakeSeederCommand');
      await makeSeederCommand(targetConfigs[0], seederName);
      break;
    }

    case 'make:factory': {
      const factoryName = args.slice(1).join(' ');
      const { makeFactoryCommand } = await import('./commands/MakeFactoryCommand');
      await makeFactoryCommand(targetConfigs[0], factoryName);
      break;
    }
  }
}

main().catch((err) => {
  console.error(red(`\n  Fatal error: ${err.message}\n`));
  process.exit(1);
});
