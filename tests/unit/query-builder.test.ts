import { QueryBuilder } from '../../src/query/QueryBuilder';
import { Expression } from '../../src/query/Expression';
import type { Connection } from '../../src/connection/Connection';

// Minimal Connection stub — no real DB needed
function makeConn(): Connection {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    disconnect: vi.fn(),
    transaction: vi.fn(),
  } as unknown as Connection;
}

function builder() {
  return new QueryBuilder(makeConn());
}

describe('QueryBuilder.toSql()', () => {
  // ── SELECT ────────────────────────────────────────────────────────────────

  it('generates SELECT * FROM table', () => {
    const { sql } = builder().from('users').toSql();
    expect(sql).toBe('SELECT * FROM "users"');
  });

  it('generates SELECT with explicit columns', () => {
    const { sql } = builder().from('users').select('id', 'name').toSql();
    expect(sql).toContain('"id"');
    expect(sql).toContain('"name"');
  });

  it('generates SELECT DISTINCT', () => {
    const { sql } = builder().from('users').distinct().toSql();
    expect(sql).toContain('SELECT DISTINCT');
  });

  it('generates selectRaw with expression', () => {
    const { sql } = builder().from('users').selectRaw('COUNT(*) as total').toSql();
    expect(sql).toContain('COUNT(*) as total');
  });

  // ── WHERE ─────────────────────────────────────────────────────────────────

  it('generates WHERE with equality shorthand', () => {
    const { sql, bindings } = builder().from('users').where('active', true).toSql();
    expect(sql).toContain('WHERE');
    expect(sql).toContain('"active"');
    expect(bindings).toContain(true);
  });

  it('generates WHERE with explicit operator', () => {
    const { sql, bindings } = builder().from('users').where('age', '>=', 18).toSql();
    expect(sql).toContain('>=');
    expect(bindings).toContain(18);
  });

  it('generates WHERE IN', () => {
    const { sql, bindings } = builder().from('users').whereIn('role', ['admin', 'mod']).toSql();
    expect(sql).toContain('IN');
    expect(bindings).toEqual(expect.arrayContaining(['admin', 'mod']));
  });

  it('generates WHERE NOT IN', () => {
    const { sql } = builder().from('users').whereNotIn('status', ['banned']).toSql();
    expect(sql).toContain('NOT IN');
  });

  it('generates WHERE IS NULL', () => {
    const { sql } = builder().from('users').whereNull('deleted_at').toSql();
    expect(sql).toContain('IS NULL');
  });

  it('generates WHERE IS NOT NULL', () => {
    const { sql } = builder().from('users').whereNotNull('email').toSql();
    expect(sql).toContain('IS NOT NULL');
  });

  it('generates WHERE with OR', () => {
    const { sql } = builder()
      .from('users')
      .where('role', 'admin')
      .orWhere('role', 'mod')
      .toSql();
    expect(sql).toContain('OR');
  });

  it('generates nested WHERE group', () => {
    const { sql } = builder()
      .from('users')
      .where((q) => {
        q.where('a', 1).orWhere('b', 2);
      })
      .toSql();
    expect(sql).toContain('(');
    expect(sql).toContain('OR');
  });

  it('generates whereRaw', () => {
    const { sql, bindings } = builder()
      .from('users')
      .whereRaw('age > $1', [21])
      .toSql();
    expect(sql).toContain('age > $1');
    expect(bindings).toContain(21);
  });

  it('generates WHERE EXISTS (subquery)', () => {
    const { sql } = builder()
      .from('users')
      .whereExists((q) => q.from('orders').where('orders.user_id', 'users.id'))
      .toSql();
    expect(sql).toContain('EXISTS');
    expect(sql).toContain('SELECT');
  });

  // ── ORDER BY ──────────────────────────────────────────────────────────────

  it('generates ORDER BY asc (default)', () => {
    const { sql } = builder().from('users').orderBy('name').toSql();
    expect(sql).toContain('ORDER BY');
    expect(sql).toContain('"name"');
    expect(sql.toLowerCase()).toContain('asc');
  });

  it('generates ORDER BY desc', () => {
    const { sql } = builder().from('users').orderByDesc('created_at').toSql();
    expect(sql.toLowerCase()).toContain('desc');
  });

  // ── LIMIT / OFFSET ────────────────────────────────────────────────────────

  it('generates LIMIT', () => {
    const { sql } = builder().from('users').limit(10).toSql();
    expect(sql).toContain('LIMIT 10');
  });

  it('generates OFFSET', () => {
    const { sql } = builder().from('users').offset(20).toSql();
    expect(sql).toContain('OFFSET 20');
  });

  it('generates LIMIT + OFFSET together', () => {
    const { sql } = builder().from('users').limit(10).offset(30).toSql();
    expect(sql).toContain('LIMIT 10');
    expect(sql).toContain('OFFSET 30');
  });

  // ── JOIN ──────────────────────────────────────────────────────────────────

  it('generates INNER JOIN', () => {
    const { sql } = builder()
      .from('users')
      .join('orders', 'orders.user_id', '=', 'users.id')
      .toSql();
    expect(sql).toContain('INNER JOIN');
    expect(sql).toContain('"orders"');
  });

  it('generates LEFT JOIN', () => {
    const { sql } = builder()
      .from('users')
      .leftJoin('profiles', 'profiles.user_id', '=', 'users.id')
      .toSql();
    expect(sql).toContain('LEFT JOIN');
  });

  // ── GROUP BY / HAVING ─────────────────────────────────────────────────────

  it('generates GROUP BY', () => {
    const { sql } = builder().from('orders').groupBy('status').toSql();
    expect(sql).toContain('GROUP BY');
    expect(sql).toContain('"status"');
  });

  it('generates HAVING', () => {
    const { sql, bindings } = builder()
      .from('orders')
      .groupBy('status')
      .having('total', '>', 100)
      .toSql();
    expect(sql).toContain('HAVING');
    expect(bindings).toContain(100);
  });

  // ── RAW EXPRESSION ────────────────────────────────────────────────────────

  it('supports raw Expression in select', () => {
    const { sql } = builder()
      .from('users')
      .select(new Expression('COUNT(*) as cnt'))
      .toSql();
    expect(sql).toContain('COUNT(*) as cnt');
  });

  // ── INVALID OPERATOR ──────────────────────────────────────────────────────

  it('throws on invalid operator', () => {
    expect(() => builder().from('users').where('age', 'BADOP', 18)).toThrow(/Invalid operator/);
  });
});
