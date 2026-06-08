import * as fs from 'fs';
import * as path from 'path';
import { OrmConfig, resolveFactoriesPath } from '../utils/config';
import { bold, cyan, gray, green, red } from '../utils/colors';

function normaliseNames(input: string): { className: string; modelName: string } {
  const pascal = input
    .split(/[_\-\s]+/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');

  const className = pascal.endsWith('Factory') ? pascal : `${pascal}Factory`;
  const modelName = className.replace(/Factory$/, '');

  return { className, modelName };
}

function generateTemplate(className: string, modelName: string): string {
  return `import { Factory } from '@wrsouza/orion';
// import { ${modelName} } from '../models/${modelName}';

export class ${className} extends Factory<any> {
  // model = ${modelName};

  definition(): Record<string, unknown> {
    return {
      //
    };
  }
}
`;
}

export async function makeFactoryCommand(config: OrmConfig, name: string): Promise<void> {
  if (!name) {
    console.error(red('  ERROR: Factory name is required.'));
    console.error(gray('  Usage: orion make:factory <name>'));
    process.exit(1);
  }

  const factoriesPath = resolveFactoriesPath(config);

  if (!fs.existsSync(factoriesPath)) {
    fs.mkdirSync(factoriesPath, { recursive: true });
  }

  const { className, modelName } = normaliseNames(name);
  const fileName = `${className}.ts`;
  const filePath = path.join(factoriesPath, fileName);

  if (fs.existsSync(filePath)) {
    console.error(red(`  ERROR: Factory "${fileName}" already exists.`));
    process.exit(1);
  }

  fs.writeFileSync(filePath, generateTemplate(className, modelName), 'utf8');

  console.log(cyan(bold('\n  Factory created\n')));
  console.log(`  ${green('✓')} ${fileName}`);
  console.log(gray(`\n  Path: ${filePath}\n`));
  console.log(gray(`  Tip: uncomment the model import and set model = ${modelName};\n`));
}
