import * as fs from 'fs';
import * as path from 'path';
import { OrmConfig, resolveSeedersPath } from '../utils/config';
import { bold, cyan, gray, green, red } from '../utils/colors';

function normaliseClassName(name: string): string {
  const pascal = name
    .split(/[_\-\s]+/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
  return pascal.endsWith('Seeder') ? pascal : `${pascal}Seeder`;
}

function generateTemplate(className: string): string {
  return `import { Seeder } from '@wrsouza/orion';

export default class ${className} extends Seeder {
  async run(): Promise<void> {
    //
  }
}
`;
}

export async function makeSeederCommand(config: OrmConfig, name: string): Promise<void> {
  if (!name) {
    console.error(red('  ERROR: Seeder name is required.'));
    console.error(gray('  Usage: orion make:seed <name>'));
    process.exit(1);
  }

  const seedersPath = resolveSeedersPath(config);

  if (!fs.existsSync(seedersPath)) {
    fs.mkdirSync(seedersPath, { recursive: true });
  }

  const className = normaliseClassName(name);
  const fileName = `${className}.ts`;
  const filePath = path.join(seedersPath, fileName);

  if (fs.existsSync(filePath)) {
    console.error(red(`  ERROR: Seeder "${fileName}" already exists.`));
    process.exit(1);
  }

  fs.writeFileSync(filePath, generateTemplate(className), 'utf8');

  console.log(cyan(bold('\n  Seeder created\n')));
  console.log(`  ${green('✓')} ${fileName}`);
  console.log(gray(`\n  Path: ${filePath}\n`));
}
