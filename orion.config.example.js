/** @type {import('./src').ConnectionConfig & { migrations: { path: string; table?: string } }} */
module.exports = {
  connection: {
    driver: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'myapp',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS || '',
    ssl: false,
    pool: {
      max: 10,
      idleTimeoutMillis: 30000,
    },
  },
  migrations: {
    path: './database/migrations',
    table: 'orion_migrations', // optional, this is the default
  },
};
