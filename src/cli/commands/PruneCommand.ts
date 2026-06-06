import * as fs from 'fs';
import * as path from 'path';
import { ConnectionManager } from '../../connection/ConnectionManager';
import { OrmConfig } from '../utils/config';
import { bold, cyan, green, red, yellow } from '../utils/colors';

/**
 * `orion model:prune [--model=ModelName] [--chunk=N]`
 *
 * Discovers models that implement `Prunable` or `MassPrunable` in the configured
 * models directory and calls `pruneAll()` on each.
 *
 * The config file can declare a `models.path` to point at the compiled JS files.
 * If not set, defaults to `./dist/models` relative to cwd.
 */
export async function pruneCommand(
  config: OrmConfig & { models?: { path?: string } },
  options: { model?: string; chunk?: number } = {}
): Promise<void> {
  ConnectionManager.addConnection('default', config.connection);

  const modelsPath = config.models?.path
    ? path.isAbsolute(config.models.path)
      ? config.models.path
      : path.join(process.cwd(), config.models.path)
    : path.join(process.cwd(), 'dist', 'models');

  console.log(cyan(bold('\n  Pruning models...\n')));

  if (!fs.existsSync(modelsPath)) {
    console.warn(
      yellow(`  [warn] Models directory not found: ${modelsPath}\n`) +
        `  Set "models.path" in orion.config.js to point at your compiled model files.\n`
    );
    process.exit(0);
  }

  // Collect model files
  const files = fs
    .readdirSync(modelsPath)
    .filter((f) => f.endsWith('.js'))
    .map((f) => path.join(modelsPath, f));

  let totalPruned = 0;
  let modelsProcessed = 0;

  for (const file of files) {
    let mod: Record<string, unknown>;
    try {
      mod = require(file);
    } catch {
      continue;
    }

    for (const [exportName, exported] of Object.entries(mod)) {
      if (typeof exported !== 'function') continue;
      if (options.model && exportName !== options.model) continue;

      const ModelClass = exported as any;

      // Must have a static pruneAll method (Prunable or MassPrunable)
      if (typeof ModelClass.pruneAll !== 'function') continue;

      try {
        const count = await ModelClass.pruneAll(options.chunk ?? 1000);
        totalPruned += count;
        modelsProcessed++;
        console.log(`  ${green('✓')} ${bold(exportName)} — pruned ${count} record(s)`);
      } catch (err) {
        console.error(`  ${red('✗')} ${bold(exportName)} — ${(err as Error).message}`);
      }
    }
  }

  await ConnectionManager.disconnectAll();

  if (modelsProcessed === 0) {
    console.log(yellow('  No prunable models found.\n'));
  } else {
    console.log(
      `\n  ${green(bold('Done.'))} Pruned ${totalPruned} record(s) across ${modelsProcessed} model(s).\n`
    );
  }
}
