import { SQLiteQueryGrammar } from '../../src/query/grammars/SQLiteQueryGrammar';
import { QueryBuilder } from '../../src/query/QueryBuilder';
import { Expression } from '../../src/query/Expression';
import type { Connection } from '../../src/connection/Connection';

function makeConn(): Connection {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    disconnect: vi.fn(),
    transaction: vi.fn(),
  } as unknown as Connection;
}

function makeQb(table: string = 'posts'): { qb: QueryBuilder; grammar: SQLiteQueryGrammar } {
  const grammar = new SQLiteQueryGrammar();
  const qb = new QueryBuilder(makeConn(), grammar);
  qb.from(table);
  return { qb, grammar };
}

describe('SQLiteQueryGrammar', () => {
  // ── wrap / columnize ──────────────────────────────────────────────────────

  describe('wrap()', () => {
    it('wraps simple identifier with double-quotes', () => {
      const { grammar } = makeQb();
      expect(grammar.wrap('name')).toBe('"name"');
    });

    it('wraps dotted identifier as "table"."column"', () => {
      const { grammar } = makeQb();
      expect(grammar.wrap('users.id')).toBe('"users"."id"');
    });

    it('returns * unchanged', () => {
      const { grammar } = makeQb();
      expect(grammar.wrap('*')).toBe('*');
    });

    it('passes through Expression values', () => {
      const { grammar } = makeQb();
      expect(grammar.wrap(new Expression('NOW()'))).toBe('NOW()');
    });

    it('passes through values containing parentheses unchanged', () => {
      const { grammar } = makeQb();
      expect(grammar.wrap('COUNT(*)')).toBe('COUNT(*)');
    });
  });

  describe('columnize()', () => {
    it('wraps and joins multiple columns', () => {
      const { grammar } = makeQb();
      expect(grammar.columnize(['id', 'name'])).toBe('"id", "name"');
    });
  });

  // ── compileSelect ─────────────────────────────────────────────────────────

  describe('compileSelect()', () => {
    it('generates SELECT * FROM "table"', () => {
      const { qb, grammar } = makeQb('posts');
      const { sql, bindings } = grammar.compileSelect(qb);
      expect(sql).toBe('SELECT * FROM "posts"');
      expect(bindings).toEqual([]);
    });

    it('generates SELECT with explicit columns', () => {
      const { qb, grammar } = makeQb('posts');
      qb.select('id', 'title');
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toBe('SELECT "id", "title" FROM "posts"');
    });

    it('generates SELECT DISTINCT', () => {
      const { qb, grammar } = makeQb('posts');
      qb.distinct();
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('SELECT DISTINCT');
    });

    it('generates column alias with AS', () => {
      const { qb, grammar } = makeQb('posts');
      qb.select('title as t');
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toBe('SELECT "title" AS "t" FROM "posts"');
    });

    it('generates WHERE clause with binding', () => {
      const { qb, grammar } = makeQb('posts');
      qb.where('status', 'published');
      const { sql, bindings } = grammar.compileSelect(qb);
      expect(sql).toBe('SELECT * FROM "posts" WHERE "status" = ?');
      expect(bindings).toEqual(['published']);
    });

    it('generates INNER JOIN', () => {
      const { qb, grammar } = makeQb('posts');
      qb.join('users', 'posts.user_id', '=', 'users.id');
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('INNER JOIN "users"');
      expect(sql).toContain('"posts"."user_id" = "users"."id"');
    });

    it('generates LEFT JOIN', () => {
      const { qb, grammar } = makeQb('posts');
      qb.leftJoin('categories', 'posts.category_id', '=', 'categories.id');
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('LEFT JOIN "categories"');
    });

    it('generates GROUP BY', () => {
      const { qb, grammar } = makeQb('posts');
      qb.groupBy('status');
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('GROUP BY "status"');
    });

    it('generates HAVING with binding', () => {
      const { qb, grammar } = makeQb('posts');
      qb.groupBy('status').having('count', '>', 5);
      const { sql, bindings } = grammar.compileSelect(qb);
      expect(sql).toContain('HAVING "count" > ?');
      expect(bindings).toContain(5);
    });

    it('generates ORDER BY ASC', () => {
      const { qb, grammar } = makeQb('posts');
      qb.orderBy('created_at');
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('ORDER BY "created_at" ASC');
    });

    it('generates ORDER BY DESC', () => {
      const { qb, grammar } = makeQb('posts');
      qb.orderBy('created_at', 'desc');
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('ORDER BY "created_at" DESC');
    });

    it('generates LIMIT', () => {
      const { qb, grammar } = makeQb('posts');
      qb.limit(10);
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('LIMIT 10');
    });

    it('generates OFFSET', () => {
      const { qb, grammar } = makeQb('posts');
      qb.limit(10).offset(20);
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('OFFSET 20');
    });

    it('silently omits locking hints (SQLite does not support them)', () => {
      const { qb, grammar } = makeQb('posts');
      qb.lockForUpdate();
      const { sql } = grammar.compileSelect(qb);
      expect(sql).not.toContain('FOR UPDATE');
    });

    it('generates complex SELECT with JOIN + WHERE + ORDER + LIMIT', () => {
      const { qb, grammar } = makeQb('posts');
      qb.select('posts.id', 'posts.title')
        .join('users', 'posts.user_id', '=', 'users.id')
        .where('posts.status', 'published')
        .orderBy('posts.created_at', 'desc')
        .limit(5);
      const { sql, bindings } = grammar.compileSelect(qb);
      expect(sql).toContain('INNER JOIN');
      expect(sql).toContain('WHERE');
      expect(sql).toContain('ORDER BY');
      expect(sql).toContain('LIMIT 5');
      expect(bindings).toEqual(['published']);
    });

    it('generates Expression in SELECT', () => {
      const { qb, grammar } = makeQb('posts');
      qb.selectRaw('COUNT(*) as total');
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('COUNT(*) as total');
    });
  });

  // ── WHERE variants ────────────────────────────────────────────────────────

  describe('WHERE variants', () => {
    it('whereNull → IS NULL', () => {
      const { qb, grammar } = makeQb('posts');
      qb.whereNull('deleted_at');
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('"deleted_at" IS NULL');
    });

    it('whereNotNull → IS NOT NULL', () => {
      const { qb, grammar } = makeQb('posts');
      qb.whereNotNull('deleted_at');
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('"deleted_at" IS NOT NULL');
    });

    it('whereBetween → BETWEEN ? AND ?', () => {
      const { qb, grammar } = makeQb('posts');
      qb.whereBetween('views', [100, 500]);
      const { sql, bindings } = grammar.compileSelect(qb);
      expect(sql).toContain('"views" BETWEEN ? AND ?');
      expect(bindings).toEqual([100, 500]);
    });

    it('whereNotBetween → NOT BETWEEN ? AND ?', () => {
      const { qb, grammar } = makeQb('posts');
      qb.whereNotBetween('views', [100, 500]);
      const { sql, bindings } = grammar.compileSelect(qb);
      expect(sql).toContain('"views" NOT BETWEEN ? AND ?');
      expect(bindings).toEqual([100, 500]);
    });

    it('whereIn → IN (?)', () => {
      const { qb, grammar } = makeQb('posts');
      qb.whereIn('status', ['draft', 'published']);
      const { sql, bindings } = grammar.compileSelect(qb);
      expect(sql).toContain('"status" IN (?, ?)');
      expect(bindings).toEqual(['draft', 'published']);
    });

    it('whereIn with empty array → 1 = 0', () => {
      const { qb, grammar } = makeQb('posts');
      qb.whereIn('status', []);
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('1 = 0');
    });

    it('whereNotIn with empty array → 1 = 1', () => {
      const { qb, grammar } = makeQb('posts');
      qb.whereNotIn('status', []);
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('1 = 1');
    });

    it('whereColumn → column = column', () => {
      const { qb, grammar } = makeQb('posts');
      qb.whereColumn('created_at', '=', 'updated_at');
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('"created_at" = "updated_at"');
    });

    it('orWhere adds OR prefix', () => {
      const { qb, grammar } = makeQb('posts');
      qb.where('status', 'draft').orWhere('status', 'published');
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('OR "status" = ?');
    });

    it('nested where groups conditions in parentheses', () => {
      const { qb, grammar } = makeQb('posts');
      qb.where((sub) => {
        sub.where('status', 'draft').orWhere('status', 'published');
      });
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('(');
      expect(sql).toContain(')');
    });

    it('whereRaw injects raw SQL with bindings', () => {
      const { qb, grammar } = makeQb('posts');
      qb.whereRaw('"views" > ?', [10]);
      const { sql, bindings } = grammar.compileSelect(qb);
      expect(sql).toContain('"views" > ?');
      expect(bindings).toContain(10);
    });

    it('whereExists uses EXISTS subquery', () => {
      const { qb, grammar } = makeQb('posts');
      qb.whereExists((sub) => {
        sub.from('comments').where('comments.post_id', 1);
      });
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('EXISTS (SELECT * FROM "comments"');
    });

    it('whereNotExists uses NOT EXISTS subquery', () => {
      const { qb, grammar } = makeQb('posts');
      qb.whereNotExists((sub) => {
        sub.from('comments').where('comments.post_id', 1);
      });
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('NOT EXISTS (');
    });

    it('whereIn with subquery uses IN (SELECT ...)', () => {
      const grammar = new SQLiteQueryGrammar();
      const conn = makeConn();
      const subQb = new QueryBuilder(conn, grammar);
      subQb.from('users').select('id').where('active', true);
      const { qb } = makeQb('posts');
      qb.whereIn('user_id', subQb);
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('"user_id" IN (SELECT');
    });

    it('whereNotIn with subquery uses NOT IN (SELECT ...)', () => {
      const grammar = new SQLiteQueryGrammar();
      const conn = makeConn();
      const subQb = new QueryBuilder(conn, grammar);
      subQb.from('banned_users').select('id');
      const { qb } = makeQb('posts');
      qb.whereNotIn('user_id', subQb);
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('"user_id" NOT IN (SELECT');
    });

    it('where with Expression value uses raw value without binding', () => {
      const { qb, grammar } = makeQb('posts');
      qb.where('created_at', new Expression('NOW()'));
      const { sql, bindings } = grammar.compileSelect(qb);
      expect(sql).toContain('"created_at" = NOW()');
      expect(bindings).toEqual([]);
    });
  });

  // ── compileInsert ─────────────────────────────────────────────────────────

  describe('compileInsert()', () => {
    it('generates single-row INSERT', () => {
      const { qb, grammar } = makeQb('posts');
      const { sql, bindings } = grammar.compileInsert(qb, [{ title: 'Hello', status: 'draft' }]);
      expect(sql).toBe('INSERT INTO "posts" ("title", "status") VALUES (?, ?)');
      expect(bindings).toEqual(['Hello', 'draft']);
    });

    it('generates multi-row INSERT', () => {
      const { qb, grammar } = makeQb('posts');
      const rows = [
        { title: 'First', status: 'draft' },
        { title: 'Second', status: 'published' },
      ];
      const { sql, bindings } = grammar.compileInsert(qb, rows);
      expect(sql).toBe('INSERT INTO "posts" ("title", "status") VALUES (?, ?), (?, ?)');
      expect(bindings).toEqual(['First', 'draft', 'Second', 'published']);
    });

    it('uses Expression values without adding bindings', () => {
      const { qb, grammar } = makeQb('posts');
      const { sql, bindings } = grammar.compileInsert(qb, [
        { created_at: new Expression('NOW()') },
      ]);
      expect(sql).toContain('NOW()');
      expect(bindings).toEqual([]);
    });
  });

  // ── compileInsertGetId ────────────────────────────────────────────────────

  describe('compileInsertGetId()', () => {
    it('generates INSERT using compileInsert (no RETURNING for SQLite)', () => {
      const { qb, grammar } = makeQb('posts');
      const { sql, bindings } = grammar.compileInsertGetId(qb, { title: 'Hello', status: 'draft' });
      expect(sql).toBe('INSERT INTO "posts" ("title", "status") VALUES (?, ?)');
      expect(bindings).toEqual(['Hello', 'draft']);
      expect(sql).not.toContain('RETURNING');
    });
  });

  // ── compileInsertOrIgnore ─────────────────────────────────────────────────

  describe('compileInsertOrIgnore()', () => {
    it('generates INSERT OR IGNORE INTO', () => {
      const { qb, grammar } = makeQb('posts');
      const { sql, bindings } = grammar.compileInsertOrIgnore(qb, [{ title: 'Hello' }]);
      expect(sql).toBe('INSERT OR IGNORE INTO "posts" ("title") VALUES (?)');
      expect(bindings).toEqual(['Hello']);
    });

    it('generates multi-row INSERT OR IGNORE', () => {
      const { qb, grammar } = makeQb('posts');
      const { sql } = grammar.compileInsertOrIgnore(qb, [
        { slug: 'a' },
        { slug: 'b' },
      ]);
      expect(sql).toMatch(/^INSERT OR IGNORE INTO/);
      // two single-column rows → VALUES (?), (?)
      expect(sql).toContain('VALUES (?), (?)');
    });
  });

  // ── compileUpsert ─────────────────────────────────────────────────────────

  describe('compileUpsert()', () => {
    it('generates INSERT ... ON CONFLICT (...) DO UPDATE SET', () => {
      const { qb, grammar } = makeQb('posts');
      const values = [{ slug: 'hello', title: 'Hello', views: 0 }];
      const { sql, bindings } = grammar.compileUpsert(qb, values, ['slug'], ['title', 'views']);
      expect(sql).toContain('INSERT INTO "posts"');
      expect(sql).toContain('ON CONFLICT ("slug") DO UPDATE SET');
      expect(sql).toContain('"title" = ?');
      expect(sql).toContain('"views" = ?');
      // insert bindings + update bindings
      expect(bindings).toEqual(['hello', 'Hello', 0, 'Hello', 0]);
    });

    it('handles multiple conflict columns', () => {
      const { qb, grammar } = makeQb('posts');
      const values = [{ tenant_id: 1, slug: 'hello', title: 'Hello' }];
      const { sql } = grammar.compileUpsert(qb, values, ['tenant_id', 'slug'], ['title']);
      expect(sql).toContain('ON CONFLICT ("tenant_id", "slug") DO UPDATE SET');
    });
  });

  // ── compileUpdate ─────────────────────────────────────────────────────────

  describe('compileUpdate()', () => {
    it('generates UPDATE ... SET without WHERE', () => {
      const { qb, grammar } = makeQb('posts');
      const { sql, bindings } = grammar.compileUpdate(qb, { title: 'New', status: 'published' });
      expect(sql).toBe('UPDATE "posts" SET "title" = ?, "status" = ?');
      expect(bindings).toEqual(['New', 'published']);
    });

    it('generates UPDATE ... SET ... WHERE', () => {
      const { qb, grammar } = makeQb('posts');
      qb.where('id', 42);
      const { sql, bindings } = grammar.compileUpdate(qb, { title: 'Updated' });
      expect(sql).toBe('UPDATE "posts" SET "title" = ? WHERE "id" = ?');
      expect(bindings).toEqual(['Updated', 42]);
    });

    it('uses Expression as raw SQL on right-hand side', () => {
      const { qb, grammar } = makeQb('posts');
      const { sql, bindings } = grammar.compileUpdate(qb, {
        updated_at: new Expression('NOW()'),
      });
      expect(sql).toContain('"updated_at" = NOW()');
      expect(bindings).toEqual([]);
    });

    it('includes JOIN in UPDATE when joins are present', () => {
      const { qb, grammar } = makeQb('posts');
      qb.join('users', 'posts.user_id', '=', 'users.id').where('users.active', true);
      const { sql } = grammar.compileUpdate(qb, { status: 'reviewed' });
      expect(sql).toContain('INNER JOIN "users"');
    });
  });

  // ── compileDelete ─────────────────────────────────────────────────────────

  describe('compileDelete()', () => {
    it('generates DELETE FROM without WHERE', () => {
      const { qb, grammar } = makeQb('posts');
      const { sql, bindings } = grammar.compileDelete(qb);
      expect(sql).toBe('DELETE FROM "posts"');
      expect(bindings).toEqual([]);
    });

    it('generates DELETE FROM ... WHERE with bindings', () => {
      const { qb, grammar } = makeQb('posts');
      qb.where('id', 7);
      const { sql, bindings } = grammar.compileDelete(qb);
      expect(sql).toBe('DELETE FROM "posts" WHERE "id" = ?');
      expect(bindings).toEqual([7]);
    });

    it('generates DELETE with multiple WHERE conditions', () => {
      const { qb, grammar } = makeQb('posts');
      qb.where('status', 'draft').where('views', '<', 10);
      const { sql, bindings } = grammar.compileDelete(qb);
      expect(sql).toContain('WHERE "status" = ? AND "views" < ?');
      expect(bindings).toEqual(['draft', 10]);
    });
  });

  // ── compileTruncate ───────────────────────────────────────────────────────

  describe('compileTruncate()', () => {
    it('generates DELETE FROM (SQLite has no TRUNCATE)', () => {
      const { grammar } = makeQb();
      const { sql, bindings } = grammar.compileTruncate('posts');
      expect(sql).toBe('DELETE FROM "posts"');
      expect(bindings).toEqual([]);
      expect(sql).not.toContain('TRUNCATE');
    });

    it('wraps the table name with double-quotes', () => {
      const { grammar } = makeQb();
      const { sql } = grammar.compileTruncate('my_table');
      expect(sql).toBe('DELETE FROM "my_table"');
    });
  });

  // ── compileAggregate ──────────────────────────────────────────────────────

  describe('compileAggregate()', () => {
    it('generates COUNT(*)', () => {
      const { qb, grammar } = makeQb('posts');
      const { sql } = grammar.compileAggregate(qb, 'count', '*');
      expect(sql).toContain('COUNT(*) AS "aggregate"');
    });

    it('generates COUNT on a specific column', () => {
      const { qb, grammar } = makeQb('posts');
      const { sql } = grammar.compileAggregate(qb, 'count', 'id');
      expect(sql).toContain('COUNT("id") AS "aggregate"');
    });

    it('generates SUM', () => {
      const { qb, grammar } = makeQb('posts');
      const { sql } = grammar.compileAggregate(qb, 'sum', 'views');
      expect(sql).toContain('SUM("views") AS "aggregate"');
    });

    it('generates AVG', () => {
      const { qb, grammar } = makeQb('posts');
      const { sql } = grammar.compileAggregate(qb, 'avg', 'rating');
      expect(sql).toContain('AVG("rating") AS "aggregate"');
    });

    it('generates COUNT DISTINCT when isDistinct is set', () => {
      const { qb, grammar } = makeQb('posts');
      qb.distinct();
      const { sql } = grammar.compileAggregate(qb, 'count', 'id');
      expect(sql).toContain('COUNT(DISTINCT "id")');
    });

    it('does NOT apply DISTINCT keyword inside COUNT when column is *', () => {
      const { qb, grammar } = makeQb('posts');
      qb.distinct();
      const { sql } = grammar.compileAggregate(qb, 'count', '*');
      // With *, the DISTINCT modifier is NOT inserted inside COUNT(...)
      expect(sql).toContain('COUNT(*)');
      expect(sql).not.toContain('COUNT(DISTINCT');
    });

    it('strips ORDER BY and LIMIT from aggregate query', () => {
      const { qb, grammar } = makeQb('posts');
      qb.orderBy('id').limit(10);
      const { sql } = grammar.compileAggregate(qb, 'count', '*');
      expect(sql).not.toContain('ORDER BY');
      expect(sql).not.toContain('LIMIT');
    });
  });

  // ── raw ORDER BY / HAVING ─────────────────────────────────────────────────

  describe('raw clauses', () => {
    it('orderByRaw injects raw ORDER BY expression', () => {
      const { qb, grammar } = makeQb('posts');
      qb.orderByRaw('"views" DESC NULLS LAST');
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('"views" DESC NULLS LAST');
    });

    it('havingRaw injects raw HAVING expression with bindings', () => {
      const { qb, grammar } = makeQb('posts');
      qb.groupBy('status').havingRaw('COUNT(*) > ?', [3]);
      const { sql, bindings } = grammar.compileSelect(qb);
      expect(sql).toContain('HAVING COUNT(*) > ?');
      expect(bindings).toContain(3);
    });

    it('multiple ORDER BY columns with raw mixed in', () => {
      const { qb, grammar } = makeQb('posts');
      qb.orderBy('title').orderByRaw('RANDOM()');
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('"title" ASC');
      expect(sql).toContain('RANDOM()');
    });
  });
});
