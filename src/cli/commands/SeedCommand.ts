import * as fs from 'fs';
import * as path from 'path';
import { ConnectionManager } from '../../connection/ConnectionManager';
import { Seeder } from '../../seeds/Seeder';
import { OrmConfig, resolveSeedersPath } from '../utils/config';
import { bold, cyan, dim, gray, green, red } from '../utils/colors';

function loadSeederClass(filePath: string): new () => Seeder {
  const mod = require(filePath);
  const SeederClass = mod.default ?? Object.values(mod)[0];

  if (typeof SeederClass !== 'function') {
    throw new Error(`[orion] Seeder file "${filePath}" must export a class as default export.`);
  }

  return SeederClass as new () => Seeder;
}

export async function seedCommand(config: OrmConfig, className?: string): Promise<void> {
  ConnectionManager.addConnection('default', config.connection);

  const seedersPath = resolveSeedersPath(config);

  if (!fs.existsSync(seedersPath)) {
    console.error(red(`  ERROR: Seeders directory not found: ${seedersPath}`));
    process.exit(1);
  }

  console.log(cyan(bold('\n  Running seeders...\n')));

  try {
    if (className) {
      // Run a specific seeder by class name
      await runNamed(seedersPath, className);
    } else {
      // Run the entry-point seeder (DatabaseSeeder by default)
      await runEntry(seedersPath, config.seeders.entry);
    }
  } catch (err) {
    console.error(red(`  ERROR: ${(err as Error).message}`));
    process.exit(1);
  } finally {
    await ConnectionManager.disconnectAll();
  }
}

async function runNamed(seedersPath: string, className: string): Promise<void> {
  const candidates = [
    path.join(seedersPath, `${className}.ts`),
    path.join(seedersPath, `${className}.js`),
  ];

  const filePath = candidates.find(fs.existsSync);

  if (!filePath) {
    throw new Error(
      `[orion] Seeder "${className}" not found in ${seedersPath}.\n` +
        `  Expected one of:\n` +
        candidates.map((c) => `    ${c}`).join('\n')
    );
  }

  const SeederClass = loadSeederClass(filePath);
  const start = Date.now();

  console.log(`  ${cyan('→')} ${className}`);
  await new SeederClass().run();
  console.log(`  ${green('✓')} ${className} ${dim(`(${Date.now() - start}ms)`)}`);
  console.log(dim(`\n  Done.\n`));
}

async function runEntry(seedersPath: string, entryName: string): Promise<void> {
  const candidates = [
    path.join(seedersPath, `${entryName}.ts`),
    path.join(seedersPath, `${entryName}.js`),
  ];

  const filePath = candidates.find(fs.existsSync);

  if (!filePath) {
    // No entry seeder — fall back to running all seeder files in alphabetical order
    console.log(
      gray(
        `  No "${entryName}" found. Running all seeders in ${path.basename(seedersPath)}/ alphabetically.\n`
      )
    );
    await runAll(seedersPath);
    return;
  }

  const SeederClass = loadSeederClass(filePath);
  const start = Date.now();

  console.log(`  ${cyan('→')} ${entryName}`);
  await new SeederClass().run();
  console.log(`  ${green('✓')} ${entryName} ${dim(`(${Date.now() - start}ms)`)}`);
  console.log(dim(`\n  Done.\n`));
}

async function runAll(seedersPath: string): Promise<void> {
  const files = fs
    .readdirSync(seedersPath)
    .filter((f) => f.endsWith('.ts') || f.endsWith('.js'))
    .sort();

  if (files.length === 0) {
    console.log(gray('  No seeder files found.\n'));
    return;
  }

  for (const file of files) {
    const filePath = path.join(seedersPath, file);
    const name = path.basename(file).replace(/\.(ts|js)$/, '');
    const SeederClass = loadSeederClass(filePath);
    const start = Date.now();

    console.log(`  ${cyan('→')} ${name}`);
    await new SeederClass().run();
    console.log(`  ${green('✓')} ${name} ${dim(`(${Date.now() - start}ms)`)}`);
  }

  console.log(dim(`\n  ${files.length} seeder(s) ran.\n`));
}
