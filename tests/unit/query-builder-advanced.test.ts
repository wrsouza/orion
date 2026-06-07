import { QueryBuilder } from '../../src/query/QueryBuilder';
import { PostgresQueryGrammar } from '../../src/query/grammars/PostgresQueryGrammar';

function makeConn() {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0, fields: [] }),
    transaction: vi.fn(),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(true),
    getGrammar: vi.fn().mockReturnValue(new PostgresQueryGrammar()),
  };
}

function builder() {
  const conn = makeConn();
  const qb = new QueryBuilder(conn as any, new PostgresQueryGrammar());
  qb.from('users');
  return { qb, conn };
}

describe('QueryBuilder — advanced methods', () => {
  // ── UPDATE ─────────────────────────────────────────────────────────────────

  it('update() executes UPDATE ... SET SQL', async () => {
    const { qb, conn } = builder();
    await qb.where('id', 1).update({ name: 'Alice' });
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE'),
      expect.any(Array)
    );
    const sql: string = conn.query.mock.calls[0][0];
    expect(sql).toContain('SET');
    expect(sql).toContain('"name"');
  });

  // ── DELETE ─────────────────────────────────────────────────────────────────

  it('delete() executes DELETE FROM SQL', async () => {
    const { qb, conn } = builder();
    await qb.where('id', 42).delete();
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM'),
      expect.any(Array)
    );
  });

  // ── INCREMENT / DECREMENT ──────────────────────────────────────────────────

  it('increment() generates UPDATE with column + amount expression', async () => {
    const { qb, conn } = builder();
    await qb.increment('views', 2);
    const sql: string = conn.query.mock.calls[0][0];
    expect(sql).toContain('UPDATE');
    expect(sql).toContain('"views"');
    expect(sql).toContain('+ 2');
  });

  it('decrement() generates UPDATE with column - amount expression', async () => {
    const { qb, conn } = builder();
    await qb.decrement('views', 2);
    const sql: string = conn.query.mock.calls[0][0];
    expect(sql).toContain('UPDATE');
    expect(sql).toContain('"views"');
    expect(sql).toContain('+ -2');
  });

  // ── AGGREGATES ─────────────────────────────────────────────────────────────

  it('count() executes COUNT(*) query', async () => {
    const { qb, conn } = builder();
    await qb.count();
    const sql: string = conn.query.mock.calls[0][0];
    expect(sql).toContain('COUNT(*)');
  });

  it('sum() executes SUM(column) query', async () => {
    const { qb, conn } = builder();
    await qb.sum('price');
    const sql: string = conn.query.mock.calls[0][0];
    expect(sql).toContain('SUM(');
    expect(sql).toContain('"price"');
  });

  it('avg() executes AVG(column) query', async () => {
    const { qb, conn } = builder();
    await qb.avg('score');
    const sql: string = conn.query.mock.calls[0][0];
    expect(sql).toContain('AVG(');
    expect(sql).toContain('"score"');
  });

  it('min() executes MIN(column) query', async () => {
    const { qb, conn } = builder();
    await qb.min('id');
    const sql: string = conn.query.mock.calls[0][0];
    expect(sql).toContain('MIN(');
    expect(sql).toContain('"id"');
  });

  it('max() executes MAX(column) query', async () => {
    const { qb, conn } = builder();
    await qb.max('id');
    const sql: string = conn.query.mock.calls[0][0];
    expect(sql).toContain('MAX(');
    expect(sql).toContain('"id"');
  });

  it('count() returns 0 when aggregate column is absent from result', async () => {
    const { qb } = builder();
    const result = await qb.count();
    expect(result).toBe(0);
  });

  // ── TRUNCATE ───────────────────────────────────────────────────────────────

  it('truncate() executes TRUNCATE TABLE SQL', async () => {
    const { qb, conn } = builder();
    await qb.truncate();
    const sql: string = conn.query.mock.calls[0][0];
    expect(sql).toContain('TRUNCATE TABLE');
    expect(sql).toContain('"users"');
  });

  // ── INSERT OR IGNORE ───────────────────────────────────────────────────────

  it('insertOrIgnore() generates INSERT ... ON CONFLICT DO NOTHING', async () => {
    const { qb, conn } = builder();
    await qb.insertOrIgnore([{ name: 'a' }]);
    const sql: string = conn.query.mock.calls[0][0];
    expect(sql).toContain('INSERT INTO');
    expect(sql).toContain('ON CONFLICT DO NOTHING');
  });

  // ── UPSERT ─────────────────────────────────────────────────────────────────

  it('upsert() generates ON CONFLICT (...) DO UPDATE SET SQL', async () => {
    const { qb, conn } = builder();
    await qb.upsert([{ email: 'a@b.com', name: 'A' }], ['email'], ['name']);
    const sql: string = conn.query.mock.calls[0][0];
    expect(sql).toContain('ON CONFLICT');
    expect(sql).toContain('"email"');
    expect(sql).toContain('DO UPDATE SET');
    expect(sql).toContain('"name"');
  });

  // ── WHERE BETWEEN ──────────────────────────────────────────────────────────

  it('whereBetween() generates BETWEEN SQL', () => {
    const { qb } = builder();
    const { sql, bindings } = qb.whereBetween('age', [18, 65]).toSql();
    expect(sql).toContain('BETWEEN');
    expect(bindings).toContain(18);
    expect(bindings).toContain(65);
  });

  it('whereNotBetween() generates NOT BETWEEN SQL', () => {
    const { qb } = builder();
    const { sql, bindings } = qb.whereNotBetween('age', [18, 65]).toSql();
    expect(sql).toContain('NOT BETWEEN');
    expect(bindings).toContain(18);
    expect(bindings).toContain(65);
  });

  // ── WHERE COLUMN ───────────────────────────────────────────────────────────

  it('whereColumn() compares two columns without bindings', () => {
    const { qb } = builder();
    const { sql, bindings } = qb.whereColumn('updated_at', '>', 'created_at').toSql();
    expect(sql).toContain('"updated_at"');
    expect(sql).toContain('>');
    expect(sql).toContain('"created_at"');
    expect(bindings).toHaveLength(0);
  });

  it('whereColumn() defaults to = when no operator given', () => {
    const { qb } = builder();
    const { sql } = qb.whereColumn('first_name', 'last_name').toSql();
    expect(sql).toContain('"first_name"');
    expect(sql).toContain('=');
    expect(sql).toContain('"last_name"');
  });

  // ── FOR PAGE ───────────────────────────────────────────────────────────────

  it('forPage(2, 15) sets limit=15 and offset=15', () => {
    const { qb } = builder();
    qb.forPage(2, 15);
    expect(qb.limitValue).toBe(15);
    expect(qb.offsetValue).toBe(15);
  });

  it('forPage(3, 10) sets limit=10 and offset=20', () => {
    const { qb } = builder();
    qb.forPage(3, 10);
    expect(qb.limitValue).toBe(10);
    expect(qb.offsetValue).toBe(20);
  });

  it('forPage() uses default perPage=15', () => {
    const { qb } = builder();
    qb.forPage(1);
    expect(qb.limitValue).toBe(15);
    expect(qb.offsetValue).toBe(0);
  });

  // ── ORDER BY RAW ───────────────────────────────────────────────────────────

  it('orderByRaw() injects raw ORDER BY expression', () => {
    const { qb } = builder();
    const { sql } = qb.orderByRaw('RANDOM()').toSql();
    expect(sql).toContain('ORDER BY');
    expect(sql).toContain('RANDOM()');
  });

  // ── SELECT RAW ─────────────────────────────────────────────────────────────

  it('selectRaw() adds raw expression to SELECT list', () => {
    const { qb } = builder();
    const { sql } = qb.selectRaw('COUNT(*) as total').toSql();
    expect(sql).toContain('COUNT(*) as total');
  });

  // ── HAVING RAW ─────────────────────────────────────────────────────────────

  it('having() generates HAVING clause', () => {
    const { qb } = builder();
    const { sql, bindings } = qb.groupBy('status').having('total', '>', 10).toSql();
    expect(sql).toContain('HAVING');
    expect(bindings).toContain(10);
  });

  it('havingRaw() injects raw HAVING fragment with bindings', () => {
    const { qb } = builder();
    const { sql, bindings } = qb.groupBy('status').havingRaw('COUNT(*) > $1', [10]).toSql();
    expect(sql).toContain('HAVING');
    expect(sql).toContain('COUNT(*) > $1');
    expect(bindings).toContain(10);
  });

  // ── LOCKING ────────────────────────────────────────────────────────────────

  it('lockForUpdate() appends FOR UPDATE to SELECT', () => {
    const { qb } = builder();
    const { sql } = qb.lockForUpdate().toSql();
    expect(sql).toContain('FOR UPDATE');
  });

  it('sharedLock() appends FOR SHARE to SELECT', () => {
    const { qb } = builder();
    const { sql } = qb.sharedLock().toSql();
    expect(sql).toContain('FOR SHARE');
  });

  // ── TO SQL ─────────────────────────────────────────────────────────────────

  it('toSql() returns SQL string without executing query', () => {
    const { qb, conn } = builder();
    const { sql, bindings } = qb.where('active', true).toSql();
    expect(conn.query).not.toHaveBeenCalled();
    expect(typeof sql).toBe('string');
    expect(Array.isArray(bindings)).toBe(true);
    expect(sql).toContain('SELECT');
    expect(sql).toContain('"users"');
  });

  // ── ADDSELECT ──────────────────────────────────────────────────────────────

  it('addSelect() appends columns to an existing selection', () => {
    const { qb } = builder();
    const { sql } = qb.select('id').addSelect('name', 'email').toSql();
    expect(sql).toContain('"id"');
    expect(sql).toContain('"name"');
    expect(sql).toContain('"email"');
  });

  // ── OR WHERE NULL / NOT NULL ───────────────────────────────────────────────

  it('orWhereNull() generates OR ... IS NULL', () => {
    const { qb } = builder();
    const { sql } = qb.where('active', true).orWhereNull('deleted_at').toSql();
    expect(sql).toContain('OR');
    expect(sql).toContain('IS NULL');
  });

  it('orWhereNotNull() generates OR ... IS NOT NULL', () => {
    const { qb } = builder();
    const { sql } = qb.where('active', true).orWhereNotNull('email').toSql();
    expect(sql).toContain('OR');
    expect(sql).toContain('IS NOT NULL');
  });

  // ── OR WHERE IN / NOT IN ───────────────────────────────────────────────────

  it('orWhereIn() generates OR ... IN (...)', () => {
    const { qb } = builder();
    const { sql } = qb.where('role', 'user').orWhereIn('role', ['admin', 'mod']).toSql();
    expect(sql).toContain('OR');
    expect(sql).toContain('IN');
  });

  it('orWhereNotIn() generates OR ... NOT IN (...)', () => {
    const { qb } = builder();
    const { sql } = qb.where('role', 'user').orWhereNotIn('status', ['banned']).toSql();
    expect(sql).toContain('OR');
    expect(sql).toContain('NOT IN');
  });

  // ── OR WHERE COLUMN ────────────────────────────────────────────────────────

  it('orWhereColumn() generates OR column op column', () => {
    const { qb } = builder();
    const { sql } = qb
      .where('active', true)
      .orWhereColumn('updated_at', '>', 'created_at')
      .toSql();
    expect(sql).toContain('OR');
    expect(sql).toContain('"updated_at"');
    expect(sql).toContain('"created_at"');
  });

  // ── OR WHERE RAW ───────────────────────────────────────────────────────────

  it('orWhereRaw() injects OR raw SQL fragment', () => {
    const { qb } = builder();
    const { sql, bindings } = qb
      .where('active', true)
      .orWhereRaw('age > $1', [21])
      .toSql();
    expect(sql).toContain('OR');
    expect(sql).toContain('age > $1');
    expect(bindings).toContain(21);
  });

  // ── WHERE NOT EXISTS ───────────────────────────────────────────────────────

  it('whereNotExists() generates NOT EXISTS (subquery)', () => {
    const { qb } = builder();
    const { sql } = qb
      .whereNotExists((q) => q.from('orders').where('orders.user_id', 'users.id'))
      .toSql();
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain('SELECT');
  });

  // ── WHERE IN SUBQUERY ──────────────────────────────────────────────────────

  it('whereIn() with QueryBuilder generates IN (subquery)', () => {
    const { qb, conn } = builder();
    const subQb = new QueryBuilder(conn as any, new PostgresQueryGrammar());
    subQb.from('orders').select('user_id');
    const { sql } = qb.whereIn('id', subQb).toSql();
    expect(sql).toContain('IN (SELECT');
  });

  it('whereNotIn() with QueryBuilder generates NOT IN (subquery)', () => {
    const { qb, conn } = builder();
    const subQb = new QueryBuilder(conn as any, new PostgresQueryGrammar());
    subQb.from('bans').select('user_id');
    const { sql } = qb.whereNotIn('id', subQb).toSql();
    expect(sql).toContain('NOT IN (SELECT');
  });

  // ── CROSS JOIN ─────────────────────────────────────────────────────────────

  it('crossJoin() generates CROSS JOIN SQL', () => {
    const { qb } = builder();
    const { sql } = qb.crossJoin('tags').toSql();
    expect(sql).toContain('CROSS JOIN');
    expect(sql).toContain('"tags"');
  });

  // ── RIGHT JOIN ─────────────────────────────────────────────────────────────

  it('rightJoin() generates RIGHT JOIN SQL', () => {
    const { qb } = builder();
    const { sql } = qb.rightJoin('profiles', 'profiles.user_id', '=', 'users.id').toSql();
    expect(sql).toContain('RIGHT JOIN');
  });

  // ── JOIN WITH CALLBACK ─────────────────────────────────────────────────────

  it('join() with callback allows custom ON conditions', () => {
    const { qb } = builder();
    const { sql } = qb
      .join('orders', (join) => {
        join.on('orders.user_id', '=', 'users.id');
      })
      .toSql();
    expect(sql).toContain('INNER JOIN');
    expect(sql).toContain('"orders"');
    expect(sql).toContain('ON');
  });

  // ── LATEST / OLDEST ────────────────────────────────────────────────────────

  it('latest() orders by created_at DESC', () => {
    const { qb } = builder();
    const { sql } = qb.latest().toSql();
    expect(sql).toContain('ORDER BY');
    expect(sql).toContain('"created_at"');
    expect(sql.toLowerCase()).toContain('desc');
  });

  it('oldest() orders by created_at ASC', () => {
    const { qb } = builder();
    const { sql } = qb.oldest().toSql();
    expect(sql).toContain('ORDER BY');
    expect(sql).toContain('"created_at"');
    expect(sql.toLowerCase()).toContain('asc');
  });

  // ── SKIP / TAKE ALIASES ────────────────────────────────────────────────────

  it('skip() is an alias for offset()', () => {
    const { qb } = builder();
    qb.skip(5);
    expect(qb.offsetValue).toBe(5);
  });

  it('take() is an alias for limit()', () => {
    const { qb } = builder();
    qb.take(10);
    expect(qb.limitValue).toBe(10);
  });

  // ── OR HAVING ──────────────────────────────────────────────────────────────

  it('orHaving() generates OR HAVING clause', () => {
    const { qb } = builder();
    const { sql } = qb
      .groupBy('status')
      .having('total', '>', 10)
      .orHaving('count', '<', 5)
      .toSql();
    expect(sql).toContain('HAVING');
    expect(sql).toContain('OR');
  });

  // ── NEW QUERY ──────────────────────────────────────────────────────────────

  it('newQuery() returns a fresh QueryBuilder sharing same connection', () => {
    const { qb } = builder();
    const fresh = qb.newQuery();
    expect(fresh).toBeInstanceOf(QueryBuilder);
    expect(fresh.fromTable).toBeNull();
    expect(fresh.wheres).toHaveLength(0);
  });

  // ── CLONE ──────────────────────────────────────────────────────────────────

  it('clone() produces an independent copy', () => {
    const { qb } = builder();
    qb.where('active', true);
    const copy = qb.clone();
    copy.where('role', 'admin');
    expect(qb.wheres).toHaveLength(1);
    expect(copy.wheres).toHaveLength(2);
  });

  // ── INSERT GET ID ──────────────────────────────────────────────────────────

  it('insertGetId() executes INSERT ... RETURNING id', async () => {
    const { qb, conn } = builder();
    await qb.insertGetId({ name: 'Bob' });
    const sql: string = conn.query.mock.calls[0][0];
    expect(sql).toContain('INSERT INTO');
    expect(sql).toContain('RETURNING');
  });

  // ── EXISTS / DOESNT EXIST ──────────────────────────────────────────────────

  it('exists() executes a SELECT 1 LIMIT 1 query', async () => {
    const { qb, conn } = builder();
    await qb.where('id', 1).exists();
    const sql: string = conn.query.mock.calls[0][0];
    expect(sql).toContain('SELECT');
    expect(sql).toContain('LIMIT 1');
  });

  it('doesntExist() returns true when rowCount is 0', async () => {
    const { qb } = builder();
    const result = await qb.where('id', 9999).doesntExist();
    expect(result).toBe(true);
  });

  // ── DUMP ──────────────────────────────────────────────────────────────────

  it('dump() logs SQL and returns this for chaining', () => {
    const { qb } = builder();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = qb.dump();
    expect(result).toBe(qb);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  // ── VALUE / PLUCK ──────────────────────────────────────────────────────────

  it('value() returns null when no rows found', async () => {
    const { qb } = builder();
    const result = await qb.value('name');
    expect(result).toBeNull();
  });

  it('pluck() returns an array of column values', async () => {
    const conn = makeConn();
    conn.query.mockResolvedValue({ rows: [{ id: 1 }, { id: 2 }], rowCount: 2, fields: [] });
    const qb = new QueryBuilder(conn as any, new PostgresQueryGrammar());
    qb.from('users');
    const ids = await qb.pluck('id');
    expect(ids).toEqual([1, 2]);
  });

  // ── CHUNK ──────────────────────────────────────────────────────────────────

  it('chunk() calls callback with each page and stops when empty', async () => {
    const conn = makeConn();
    conn.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }], rowCount: 2, fields: [] })
      .mockResolvedValueOnce({ rows: [], rowCount: 0, fields: [] });
    const qb = new QueryBuilder(conn as any, new PostgresQueryGrammar());
    qb.from('users');
    const chunks: unknown[][] = [];
    await qb.chunk(2, (rows) => { chunks.push(rows); });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(2);
  });

  it('chunk() stops early when callback returns false', async () => {
    const conn = makeConn();
    conn.query.mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1, fields: [] });
    const qb = new QueryBuilder(conn as any, new PostgresQueryGrammar());
    qb.from('users');
    let calls = 0;
    await qb.chunk(1, () => { calls++; return false; });
    expect(calls).toBe(1);
  });

  // ── CURSOR ─────────────────────────────────────────────────────────────────

  it('cursor() yields each row from the result', async () => {
    const conn = makeConn();
    conn.query.mockResolvedValue({ rows: [{ id: 1 }, { id: 2 }], rowCount: 2, fields: [] });
    const qb = new QueryBuilder(conn as any, new PostgresQueryGrammar());
    qb.from('users');
    const ids: unknown[] = [];
    for await (const row of qb.cursor()) {
      ids.push(row['id']);
    }
    expect(ids).toEqual([1, 2]);
  });

  // ── FIND ──────────────────────────────────────────────────────────────────

  it('find() queries by primary key and returns null when missing', async () => {
    const { qb, conn } = builder();
    const result = await qb.find(1);
    expect(conn.query).toHaveBeenCalled();
    expect(result).toBeNull();
  });

  // ── FIRST OR FAIL ─────────────────────────────────────────────────────────

  it('firstOrFail() throws when no row found', async () => {
    const { qb } = builder();
    await expect(qb.firstOrFail()).rejects.toThrow('No records found');
  });

  // ── AVERAGE ALIAS ─────────────────────────────────────────────────────────

  it('average() is an alias for avg()', async () => {
    const { qb, conn } = builder();
    await qb.average('score');
    const sql: string = conn.query.mock.calls[0][0];
    expect(sql).toContain('AVG(');
    expect(sql).toContain('"score"');
  });

  // ── INSERT (multiple rows) ─────────────────────────────────────────────────

  it('insert() with multiple rows generates multi-value INSERT', async () => {
    const { qb, conn } = builder();
    await qb.insert([{ name: 'Alice' }, { name: 'Bob' }]);
    const sql: string = conn.query.mock.calls[0][0];
    expect(sql).toContain('INSERT INTO');
    expect(sql).toContain('VALUES');
  });

  // ── GROUP BY MULTIPLE ──────────────────────────────────────────────────────

  it('groupBy() accepts multiple columns', () => {
    const { qb } = builder();
    const { sql } = qb.groupBy('status', 'role').toSql();
    expect(sql).toContain('GROUP BY');
    expect(sql).toContain('"status"');
    expect(sql).toContain('"role"');
  });

  // ── ALIAS IN FROM / SELECT ─────────────────────────────────────────────────

  it('from() supports table aliases', () => {
    const conn = makeConn();
    const qb = new QueryBuilder(conn as any, new PostgresQueryGrammar());
    const { sql } = qb.from('users as u').toSql();
    expect(sql).toContain('"users" AS "u"');
  });

  it('select() supports column aliases', () => {
    const { qb } = builder();
    const { sql } = qb.select('name as full_name').toSql();
    expect(sql).toContain('"name" AS "full_name"');
  });

  // ── WHERE IN EMPTY ─────────────────────────────────────────────────────────

  it('whereIn() with empty array produces 1 = 0', () => {
    const { qb } = builder();
    const { sql } = qb.whereIn('id', []).toSql();
    expect(sql).toContain('1 = 0');
  });

  it('whereNotIn() with empty array produces 1 = 1', () => {
    const { qb } = builder();
    const { sql } = qb.whereNotIn('id', []).toSql();
    expect(sql).toContain('1 = 1');
  });
});
