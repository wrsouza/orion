/**
 * Auto-register ts-node from the *project's* node_modules so that
 * TypeScript config files (src/database.ts) and migration files (.ts)
 * are loaded transparently by the CLI — no wrapper script needed.
 *
 * Resolution uses the current working directory (the user's project),
 * not the ORM's own node_modules, so the user's ts-node version and
 * tsconfig are respected.
 *
 * If ts-node is not installed the registration is silently skipped;
 * only pre-compiled .js files will be loadable in that case.
 */
try {
  const tsNodePath = require.resolve('ts-node', { paths: [process.cwd()] });

  require(tsNodePath).register({
    transpileOnly: true, // skip type-checking for speed
    compilerOptions: {
      module: 'commonjs', // force CJS regardless of project tsconfig
      moduleResolution: 'node', // must match module: commonjs
      resolvePackageJsonExports: false, // not valid with moduleResolution: node
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
    },
  });
} catch {
  // ts-node not available — .js config/migrations still work normally
}
