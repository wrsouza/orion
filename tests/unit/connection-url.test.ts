import { parseConnectionUrl } from '../../src/connection/ConnectionManager';

describe('parseConnectionUrl', () => {
  // ── postgres / postgresql ──────────────────────────────────────────────────

  it('parses postgres:// URL', () => {
    const cfg = parseConnectionUrl('postgres://alice:secret@db.example.com:5432/myapp');
    expect(cfg.driver).toBe('postgres');
    expect(cfg.host).toBe('db.example.com');
    expect(cfg.port).toBe(5432);
    expect(cfg.database).toBe('myapp');
    expect(cfg.user).toBe('alice');
    expect(cfg.password).toBe('secret');
  });

  it('parses postgresql:// scheme as postgres driver', () => {
    const cfg = parseConnectionUrl('postgresql://user:pass@localhost/testdb');
    expect(cfg.driver).toBe('postgres');
    expect(cfg.database).toBe('testdb');
  });

  // ── mysql ──────────────────────────────────────────────────────────────────

  it('parses mysql:// URL', () => {
    const cfg = parseConnectionUrl('mysql://root:pass@127.0.0.1:3306/shop');
    expect(cfg.driver).toBe('mysql');
    expect(cfg.host).toBe('127.0.0.1');
    expect(cfg.port).toBe(3306);
    expect(cfg.database).toBe('shop');
    expect(cfg.user).toBe('root');
    expect(cfg.password).toBe('pass');
  });

  // ── mariadb ────────────────────────────────────────────────────────────────

  it('parses mariadb:// URL', () => {
    const cfg = parseConnectionUrl('mariadb://user:pass@localhost:3306/mydb');
    expect(cfg.driver).toBe('mariadb');
    expect(cfg.host).toBe('localhost');
    expect(cfg.port).toBe(3306);
    expect(cfg.database).toBe('mydb');
  });

  // ── sqlserver / mssql ──────────────────────────────────────────────────────

  it('parses sqlserver:// URL', () => {
    const cfg = parseConnectionUrl('sqlserver://sa:pass@sqlhost:1433/AdventureWorks');
    expect(cfg.driver).toBe('sqlserver');
    expect(cfg.host).toBe('sqlhost');
    expect(cfg.port).toBe(1433);
    expect(cfg.database).toBe('AdventureWorks');
  });

  it('parses mssql:// scheme as sqlserver driver', () => {
    const cfg = parseConnectionUrl('mssql://sa:pass@sqlhost:1433/mydb');
    expect(cfg.driver).toBe('sqlserver');
  });

  // ── sqlite ────────────────────────────────────────────────────────────────

  it('parses sqlite://:memory:', () => {
    const cfg = parseConnectionUrl('sqlite://:memory:');
    expect(cfg.driver).toBe('sqlite');
    expect(cfg.filename).toBe(':memory:');
  });

  it('parses sqlite:///path/to/db.sqlite', () => {
    const cfg = parseConnectionUrl('sqlite:///path/to/db.sqlite');
    expect(cfg.driver).toBe('sqlite');
    expect(cfg.filename).toBe('/path/to/db.sqlite');
  });

  // ── query params ──────────────────────────────────────────────────────────

  it('parses ?ssl=true query param', () => {
    const cfg = parseConnectionUrl('postgres://user:pass@localhost/db?ssl=true');
    expect(cfg.ssl).toBe(true);
  });

  it('parses ?ssl=false query param', () => {
    const cfg = parseConnectionUrl('postgres://user:pass@localhost/db?ssl=false');
    expect(cfg.ssl).toBe(false);
  });

  it('parses ?pool_max=10 query param', () => {
    const cfg = parseConnectionUrl('postgres://user:pass@localhost/db?pool_max=10');
    expect(cfg.pool?.max).toBe(10);
  });

  it('parses ?max=5 as pool.max', () => {
    const cfg = parseConnectionUrl('postgres://user:pass@localhost/db?max=5');
    expect(cfg.pool?.max).toBe(5);
  });

  // ── error cases ───────────────────────────────────────────────────────────

  it('throws on unknown driver scheme', () => {
    expect(() => parseConnectionUrl('mongodb://localhost/mydb')).toThrow(
      /Unsupported URL scheme "mongodb"/
    );
  });

  it('throws on totally invalid URL string', () => {
    expect(() => parseConnectionUrl('not-a-url')).toThrow(/Invalid connection URL/);
  });
});
