import * as fs from 'fs';
import * as path from 'path';

export interface OrmConfig {
  connection: {
    driver: 'postgres';
    host: string;
    port?: number;
    database: string;
    user: string;
    password: string;
    ssl?: boolean;
  };
  migrations: {
    path: string;
    table?: string;
  };
}

const CONFIG_FILES = ['orion.config.ts', 'orion.config.js', 'orion.config.json'];

export function loadConfig(cwd = process.cwd()): OrmConfig {
  for (const file of CONFIG_FILES) {
    const full = path.join(cwd, file);
    if (fs.existsSync(full)) {
      const mod = require(full);
      return (mod.default ?? mod) as OrmConfig;
    }
  }

  throw new Error(
    `[orion] Config file not found. Create a "orion.config.js" in your project root.\n` +
      `  Expected one of: ${CONFIG_FILES.join(', ')}`
  );
}

export function resolveMigrationsPath(config: OrmConfig, cwd = process.cwd()): string {
  return path.isAbsolute(config.migrations.path)
    ? config.migrations.path
    : path.join(cwd, config.migrations.path);
}
