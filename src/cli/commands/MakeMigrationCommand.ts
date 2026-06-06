import * as fs from 'fs';
import * as path from 'path';
import { OrmConfig, resolveMigrationsPath } from '../utils/config';
import { bold, cyan, gray, green, red } from '../utils/colors';

function toClassName(name: string): string {
  return name
    .split(/[_\-\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function generateTimestamp(): string {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return (
    `${now.getFullYear()}` +
    `${pad(now.getMonth() + 1)}` +
    `${pad(now.getDate())}` +
    `${pad(now.getHours())}` +
    `${pad(now.getMinutes())}` +
    `${pad(now.getSeconds())}`
  );
}

function inferTableName(migrationName: string): string | null {
  const lower = migrationName.toLowerCase();

  const createMatch = lower.match(/^create_(\w+)_table$/);
  if (createMatch) return createMatch[1];

  const alterMatch = lower.match(/^(?:add|remove|drop|modify|rename)_.+_(?:to|from|in)_(\w+)$/);
  if (alterMatch) return alterMatch[1];

  return null;
}

function generateTemplate(className: string, migrationName: string): string {
  const tableName = inferTableName(migrationName);
  const isCreate = /^create_/i.test(migrationName);

  if (isCreate && tableName) {
    return `import { Migration } from 'orion';
import { Blueprint } from 'orion';

export default class ${className} extends Migration {
  async up(): Promise<void> {
    await this.Schema.create('${tableName}', (table: Blueprint) => {
      table.id();
      table.timestamps();
    });
  }

  async down(): Promise<void> {
    await this.Schema.dropIfExists('${tableName}');
  }
}
`;
  }

  if (tableName) {
    return `import { Migration } from 'orion';
import { Blueprint } from 'orion';

export default class ${className} extends Migration {
  async up(): Promise<void> {
    await this.Schema.table('${tableName}', (table: Blueprint) => {
      //
    });
  }

  async down(): Promise<void> {
    await this.Schema.table('${tableName}', (table: Blueprint) => {
      //
    });
  }
}
`;
  }

  return `import { Migration } from 'orion';

export default class ${className} extends Migration {
  async up(): Promise<void> {
    //
  }

  async down(): Promise<void> {
    //
  }
}
`;
}

export async function makeMigrationCommand(config: OrmConfig, name: string): Promise<void> {
  if (!name) {
    console.error(red('  ERROR: Migration name is required.'));
    console.error(gray('  Usage: orion make:migration <name>'));
    process.exit(1);
  }

  const migrationsPath = resolveMigrationsPath(config);

  if (!fs.existsSync(migrationsPath)) {
    fs.mkdirSync(migrationsPath, { recursive: true });
  }

  const timestamp = generateTimestamp();
  const snakeName = name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  const fileName = `${timestamp}_${snakeName}.ts`;
  const className = toClassName(snakeName);
  const filePath = path.join(migrationsPath, fileName);

  const content = generateTemplate(className, snakeName);

  fs.writeFileSync(filePath, content, 'utf8');

  console.log(cyan(bold('\n  Migration created\n')));
  console.log(`  ${green('✓')} ${fileName}`);
  console.log(gray(`\n  Path: ${filePath}\n`));
}
