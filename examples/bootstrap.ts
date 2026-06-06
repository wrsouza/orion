/**
 * Bootstrap — configure the database connection once at application startup.
 * Import this file before using any model.
 */
import { ConnectionManager, Model, MorphMap } from '../src';
import { Post } from './models/Post';

// ── Database connection ───────────────────────────────────────────────────────
//
// Option A — URL / connection string (recommended for 12-factor apps)
//
if (process.env.DATABASE_URL) {
  ConnectionManager.addConnectionUrl('default', process.env.DATABASE_URL);
  // Supports:
  //   postgres://user:pass@host:5432/mydb?ssl=true
  //   mysql://user:pass@host:3306/mydb
  //   mariadb://user:pass@host:3306/mydb
  //   sqlserver://user:pass@host:1433/mydb
  //   sqlite:///path/to/app.db
  //   sqlite://:memory:
} else {
  // Option B — explicit field-by-field config
  ConnectionManager.addConnection('default', {
    driver:   'postgres',
    host:     process.env.DB_HOST     ?? 'localhost',
    port:     Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME     ?? 'orion_example',
    user:     process.env.DB_USER     ?? 'postgres',
    password: process.env.DB_PASS     ?? '',
    pool: { max: 10 },
  });
}

// ── Polymorphic type map ──────────────────────────────────────────────────────
// Stores short aliases in the *_type column instead of full class names.
// Register all morphable types once at startup.

MorphMap.register({
  post:  Post,
});

// ── Lazy loading guard ────────────────────────────────────────────────────────
// Throw whenever a relation is accessed without eager loading.
// Great for development — catches N+1 bugs at runtime.

if (process.env.NODE_ENV !== 'production') {
  Model.preventLazyLoading();
}
