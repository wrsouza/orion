import * as fs from 'fs';
import * as path from 'path';
import { ConnectionConfig } from '../../connection/ConnectionManager';
import { OrionConfig } from '../../configure';

export interface OrmConfig {
  name: string;
  connection: ConnectionConfig;
  migrations: {
    path: string;
    table?: string;
  };
  seeders: {
    path: string;
    entry: string;
  };
}

/**
 * Config file names searched in order.
 * Legacy formats (orion.config.*) are checked first for backward compatibility.
 * The modern centralised pattern (src/database.ts, database.ts, etc.) follows.
 */
const CONFIG_FILES = [
  'orion.config.ts',
  'orion.config.js',
  'orion.config.json',
  'src/database.ts',
  'database.ts',
  'src/orion.ts',
  'orion.ts',
];

export function loadConfig(cwd = process.cwd(), configPath?: string): OrmConfig[] {
  const candidates = configPath
    ? [path.isAbsolute(configPath) ? configPath : path.join(cwd, configPath)]
    : CONFIG_FILES.map((f) => path.join(cwd, f));

  for (const full of candidates) {
    if (!fs.existsSync(full)) continue;

    const mod = require(full);
    const exported: OrionConfig | OrionConfig[] | OrmConfig = mod.default ?? mod;

    return normalise(exported, full);
  }

  const searched = configPath ?? CONFIG_FILES.join(', ');
  throw new Error(
    `[orion] Config file not found.\n` +
      `  Searched: ${searched}\n\n` +
      `  Create a "src/database.ts" with createConnection(), ` +
      `or a legacy "orion.config.js" in your project root.`
  );
}

export function resolveMigrationsPath(config: OrmConfig, cwd = process.cwd()): string {
  return path.isAbsolute(config.migrations.path)
    ? config.migrations.path
    : path.join(cwd, config.migrations.path);
}

export function resolveSeedersPath(config: OrmConfig, cwd = process.cwd()): string {
  return path.isAbsolute(config.seeders.path)
    ? config.seeders.path
    : path.join(cwd, config.seeders.path);
}

export function resolveFactoriesPath(config: OrmConfig, cwd = process.cwd()): string {
  const base = resolveMigrationsPath(config, cwd);
  return path.join(path.dirname(base), 'factories');
}

// ── Internal ──────────────────────────────────────────────────────────────────

function normalise(exported: unknown, file: string): OrmConfig[] {
  if (!exported || typeof exported !== 'object') {
    throw new Error(`[orion] Config file "${file}" must export an object or array.`);
  }

  if (Array.isArray(exported)) {
    if (exported.length === 0) {
      throw new Error(`[orion] Config file "${file}" exports an empty array.`);
    }
    return exported.map((cfg, index) => normaliseSingle(cfg, file, index));
  }

  return [normaliseSingle(exported as OrionConfig | OrmConfig, file, 0)];
}

function normaliseSingle(exported: unknown, file: string, index: number): OrmConfig {
  if (!exported || typeof exported !== 'object') {
    throw new Error(`[orion] Connection at index ${index} in "${file}" must be an object.`);
  }

  const cfg = exported as OrionConfig;
  const { connection, migrations } = cfg;

  if (!connection) {
    throw new Error(
      `[orion] Connection at index ${index} in "${file}" is missing the "connection" field.`
    );
  }

  const resolvedConnection: ConnectionConfig =
    typeof connection === 'string'
      ? resolveUrl(connection, file)
      : (connection as ConnectionConfig);

  const { seeders } = cfg;

  const migrationsPath = migrations?.path ?? './database/migrations';
  const dbBase = migrationsPath.replace(/[\\/]migrations$/, '');

  const name = cfg.name ?? (index === 0 ? 'default' : `connection_${index}`);

  return {
    name,
    connection: resolvedConnection,
    migrations: {
      path: migrationsPath,
      table: migrations?.table,
    },
    seeders: {
      path: seeders?.path ?? `${dbBase}/seeders`,
      entry: seeders?.entry ?? 'DatabaseSeeder',
    },
  };
}

function resolveUrl(url: string, file: string): ConnectionConfig {
  try {
    const { parseConnectionUrl } = require('../../connection/ConnectionManager');
    return parseConnectionUrl(url);
  } catch {
    throw new Error(`[orion] Config file "${file}" has an invalid connection URL: "${url}".`);
  }
}
