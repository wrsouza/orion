import * as fs from 'fs';
import * as path from 'path';
import { ConnectionConfig } from '../../connection/ConnectionManager';
import { OrionConfig } from '../../configure';

export interface OrmConfig {
  connection: ConnectionConfig;
  migrations: {
    path: string;
    table?: string;
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

export function loadConfig(cwd = process.cwd(), configPath?: string): OrmConfig {
  const candidates = configPath
    ? [path.isAbsolute(configPath) ? configPath : path.join(cwd, configPath)]
    : CONFIG_FILES.map((f) => path.join(cwd, f));

  for (const full of candidates) {
    if (!fs.existsSync(full)) continue;

    const mod = require(full);
    const exported: OrionConfig | OrmConfig = mod.default ?? mod;

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

// ── Internal ──────────────────────────────────────────────────────────────────

function normalise(exported: unknown, file: string): OrmConfig {
  if (!exported || typeof exported !== 'object') {
    throw new Error(`[orion] Config file "${file}" must export an object.`);
  }

  const { connection, migrations } = exported as OrionConfig;

  if (!connection) {
    throw new Error(`[orion] Config file "${file}" is missing the "connection" field.`);
  }

  const resolvedConnection: ConnectionConfig =
    typeof connection === 'string'
      ? resolveUrl(connection, file)
      : (connection as ConnectionConfig);

  return {
    connection: resolvedConnection,
    migrations: {
      path: migrations?.path ?? './database/migrations',
      table: migrations?.table,
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
