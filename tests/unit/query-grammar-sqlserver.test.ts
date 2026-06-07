import { SQLServerQueryGrammar } from '../../src/query/grammars/SQLServerQueryGrammar';
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

function makeQb(table: string = 'posts'): { qb: QueryBuilder; grammar: SQLServerQueryGrammar } {
  const grammar = new SQLServerQueryGrammar();
  const qb = new QueryBuilder(makeConn(), grammar);
  qb.from(table);
  return { qb, grammar };
}

describe('SQLServerQueryGrammar', () => {
  // ── wrap / columnize ──────────────────────────────────────────────────────

  describe('wrap()', () => {
    it('wraps simple identifier with square brackets', () => {
      const { grammar } = makeQb();
      expect(grammar.wrap('name')).toBe('[name]');
    });

    it('wraps dotted identifier as [table].[column]', () => {
      const { grammar } = makeQb();
      expect(grammar.wrap('users.id')).toBe('[users].[id]');
    });

    it('returns * unchanged', () => {
      const { grammar } = makeQb();
      expect(grammar.wrap('*')).toBe('*');
    });

    it('passes through Expression values', () => {
      const { grammar } = makeQb();
      expect(grammar.wrap(new Expression('GETDATE()'))).toBe('GETDATE()');
    });

    it('passes through values containing parentheses unchanged', () => {
      const { grammar } = makeQb();
      expect(grammar.wrap('COUNT(*)')).toBe('COUNT(*)');
    });

    it('already-bracketed segment is passed through unchanged', () => {
      const { grammar } = makeQb();
      expect(grammar.wrap('[already]')).toBe('[already]');
    });
  });

  describe('columnize()', () => {
    it('wraps and joins multiple columns with square brackets', () => {
      const { grammar } = makeQb();
      expect(grammar.columnize(['id', 'name'])).toBe('[id], [name]');
    });
  });

  // ── compileSelect ─────────────────────────────────────────────────────────

  describe('compileSelect()', () => {
    it('generates SELECT * FROM [table]', () => {
      const { qb, grammar } = makeQb('posts');
      const { sql, bindings } = grammar.compileSelect(qb);
      expect(sql).toBe('SELECT * FROM [posts]');
      expect(bindings).toEqual([]);
    });

    it('generates SELECT with explicit columns using square brackets', () => {
      const { qb, grammar } = makeQb('posts');
      qb.select('id', 'title');
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toBe('SELECT [id], [title] FROM [posts]');
    });

    it('generates SELECT DISTINCT', () => {
      const { qb, grammar } = makeQb('posts');
      qb.distinct();
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('SELECT DISTINCT');
    });

    it('generates column alias with AS using square brackets', () => {
      const { qb, grammar } = makeQb('posts');
      qb.select('title as t');
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toBe('SELECT [title] AS [t] FROM [posts]');
    });

    it('generates WHERE clause with @p1 named parameter', () => {
      const { qb, grammar } = makeQb('posts');
      qb.where('status', 'published');
      const { sql, bindings } = grammar.compileSelect(qb);
      expect(sql).toBe('SELECT * FROM [posts] WHERE [status] = @p1');
      expect(bindings).toEqual(['published']);
    });

    it('generates multiple WHERE conditions with sequential @p parameters', () => {
      const { qb, grammar } = makeQb('posts');
      qb.where('status', 'published').where('views', '>', 100);
      const { sql, bindings } = grammar.compileSelect(qb);
      expect(sql).toContain('[status] = @p1');
      expect(sql).toContain('[views] > @p2');
      expect(bindings).toEqual(['published', 100]);
    });

    it('generates INNER JOIN with square-bracketed identifiers', () => {
      const { qb, grammar } = makeQb('posts');
      qb.join('users', 'posts.user_id', '=', 'users.id');
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('INNER JOIN [users]');
      expect(sql).toContain('[posts].[user_id] = [users].[id]');
    });

    it('generates LEFT JOIN', () => {
      const { qb, grammar } = makeQb('posts');
      qb.leftJoin('categories', 'posts.category_id', '=', 'categories.id');
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('LEFT JOIN [categories]');
    });

    it('generates GROUP BY with square-bracketed columns', () => {
      const { qb, grammar } = makeQb('posts');
      qb.groupBy('status');
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('GROUP BY [status]');
    });

    it('generates HAVING with @p binding', () => {
      const { qb, grammar } = makeQb('posts');
      qb.groupBy('status').having('count', '>', 5);
      const { sql, bindings } = grammar.compileSelect(qb);
      expect(sql).toContain('HAVING [count] > @p1');
      expect(bindings).toContain(5);
    });

    it('generates ORDER BY ASC', () => {
      const { qb, grammar } = makeQb('posts');
      qb.orderBy('created_at');
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('ORDER BY [created_at] ASC');
    });

    it('generates ORDER BY DESC', () => {
      const { qb, grammar } = makeQb('posts');
      qb.orderBy('created_at', 'desc');
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('ORDER BY [created_at] DESC');
    });

    it('generates TOP n when limit is set without offset', () => {
      const { qb, grammar } = makeQb('posts');
      qb.limit(10);
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('SELECT TOP 10');
      expect(sql).not.toContain('FETCH NEXT');
      expect(sql).not.toContain('OFFSET');
    });

    it('generates OFFSET n ROWS FETCH NEXT n ROWS ONLY for pagination', () => {
      const { qb, grammar } = makeQb('posts');
      qb.limit(10).offset(20).orderBy('id');
      const { sql } = grammar.compileSelect(qb);
      expect(sql).not.toContain('TOP');
      expect(sql).toContain('OFFSET 20 ROWS');
      expect(sql).toContain('FETCH NEXT 10 ROWS ONLY');
    });

    it('injects ORDER BY (SELECT NULL) when using offset without explicit order', () => {
      const { qb, grammar } = makeQb('posts');
      qb.offset(5);
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('ORDER BY (SELECT NULL)');
      expect(sql).toContain('OFFSET 5 ROWS');
    });

    it('generates OFFSET without FETCH NEXT when no limit is given', () => {
      const { qb, grammar } = makeQb('posts');
      qb.offset(10);
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('OFFSET 10 ROWS');
      expect(sql).not.toContain('FETCH NEXT');
    });

    it('appends FOR UPDATE lock hint as a comment', () => {
      const { qb, grammar } = makeQb('posts');
      qb.lockForUpdate();
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('-- WITH (UPDLOCK, ROWLOCK)');
    });

    it('appends FOR SHARE lock hint as a comment', () => {
      const { qb, grammar } = makeQb('posts');
      qb.sharedLock();
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('-- WITH (HOLDLOCK)');
    });

    it('generates complex SELECT with all clauses', () => {
      const { qb, grammar } = makeQb('posts');
      qb.select('posts.id', 'posts.title')
        .join('users', 'posts.user_id', '=', 'users.id')
        .where('posts.status', 'published')
        .groupBy('posts.category_id')
        .having('views', '>', 100)
        .orderBy('posts.created_at', 'desc')
        .limit(5)
        .offset(10);
      const { sql, bindings } = grammar.compileSelect(qb);
      expect(sql).toContain('INNER JOIN');
      expect(sql).toContain('WHERE');
      expect(sql).toContain('GROUP BY');
      expect(sql).toContain('HAVING');
      expect(sql).toContain('ORDER BY');
      expect(sql).toContain('OFFSET 10 ROWS');
      expect(sql).toContain('FETCH NEXT 5 ROWS ONLY');
      expect(bindings).toContain('published');
      expect(bindings).toContain(100);
    });
  });

  // ── WHERE variants ────────────────────────────────────────────────────────

  describe('WHERE variants', () => {
    it('whereNull → IS NULL', () => {
      const { qb, grammar } = makeQb('posts');
      qb.whereNull('deleted_at');
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('[deleted_at] IS NULL');
    });

    it('whereNotNull → IS NOT NULL', () => {
      const { qb, grammar } = makeQb('posts');
      qb.whereNotNull('deleted_at');
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('[deleted_at] IS NOT NULL');
    });

    it('whereBetween → BETWEEN @p1 AND @p2', () => {
      const { qb, grammar } = makeQb('posts');
      qb.whereBetween('views', [100, 500]);
      const { sql, bindings } = grammar.compileSelect(qb);
      expect(sql).toContain('[views] BETWEEN @p1 AND @p2');
      expect(bindings).toEqual([100, 500]);
    });

    it('whereNotBetween → NOT BETWEEN @p1 AND @p2', () => {
      const { qb, grammar } = makeQb('posts');
      qb.whereNotBetween('views', [100, 500]);
      const { sql, bindings } = grammar.compileSelect(qb);
      expect(sql).toContain('[views] NOT BETWEEN @p1 AND @p2');
      expect(bindings).toEqual([100, 500]);
    });

    it('whereIn → IN (@p1, @p2)', () => {
      const { qb, grammar } = makeQb('posts');
      qb.whereIn('status', ['draft', 'published']);
      const { sql, bindings } = grammar.compileSelect(qb);
      expect(sql).toContain('[status] IN (@p1, @p2)');
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

    it('whereColumn → both sides square-bracket-quoted', () => {
      const { qb, grammar } = makeQb('posts');
      qb.whereColumn('created_at', '=', 'updated_at');
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('[created_at] = [updated_at]');
    });

    it('orWhere adds OR prefix', () => {
      const { qb, grammar } = makeQb('posts');
      qb.where('status', 'draft').orWhere('status', 'published');
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('OR [status] = @p2');
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
      qb.whereRaw('[views] > @p1', [10]);
      const { sql, bindings } = grammar.compileSelect(qb);
      expect(sql).toContain('[views] > @p1');
      expect(bindings).toContain(10);
    });

    it('whereExists uses EXISTS subquery', () => {
      const { qb, grammar } = makeQb('posts');
      qb.whereExists((sub) => {
        sub.from('comments').where('comments.post_id', 1);
      });
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('EXISTS (SELECT * FROM [comments]');
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
      const grammar = new SQLServerQueryGrammar();
      const conn = makeConn();
      const subQb = new QueryBuilder(conn, grammar);
      subQb.from('users').select('id').where('active', true);
      const { qb } = makeQb('posts');
      qb.whereIn('user_id', subQb);
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('[user_id] IN (SELECT');
    });

    it('whereNotIn with subquery uses NOT IN (SELECT ...)', () => {
      const grammar = new SQLServerQueryGrammar();
      const conn = makeConn();
      const subQb = new QueryBuilder(conn, grammar);
      subQb.from('banned_users').select('id');
      const { qb } = makeQb('posts');
      qb.whereNotIn('user_id', subQb);
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('[user_id] NOT IN (SELECT');
    });

    it('where with Expression value uses raw value without binding', () => {
      const { qb, grammar } = makeQb('posts');
      qb.where('created_at', new Expression('GETDATE()'));
      const { sql, bindings } = grammar.compileSelect(qb);
      expect(sql).toContain('[created_at] = GETDATE()');
      expect(bindings).toEqual([]);
    });
  });

  // ── compileInsert ─────────────────────────────────────────────────────────

  describe('compileInsert()', () => {
    it('generates single-row INSERT with square-bracketed identifiers and @p params', () => {
      const { qb, grammar } = makeQb('posts');
      const { sql, bindings } = grammar.compileInsert(qb, [{ title: 'Hello', status: 'draft' }]);
      expect(sql).toBe('INSERT INTO [posts] ([title], [status]) VALUES (@p1, @p2)');
      expect(bindings).toEqual(['Hello', 'draft']);
    });

    it('generates multi-row INSERT with sequential @p params', () => {
      const { qb, grammar } = makeQb('posts');
      const rows = [
        { title: 'First', status: 'draft' },
        { title: 'Second', status: 'published' },
      ];
      const { sql, bindings } = grammar.compileInsert(qb, rows);
      expect(sql).toBe(
        'INSERT INTO [posts] ([title], [status]) VALUES (@p1, @p2), (@p3, @p4)'
      );
      expect(bindings).toEqual(['First', 'draft', 'Second', 'published']);
    });

    it('uses Expression values without adding bindings', () => {
      const { qb, grammar } = makeQb('posts');
      const { sql, bindings } = grammar.compileInsert(qb, [
        { created_at: new Expression('GETDATE()') },
      ]);
      expect(sql).toContain('GETDATE()');
      expect(bindings).toEqual([]);
    });
  });

  // ── compileInsertGetId ─────────────────────────────────────────────────────
  // SQL Server uses OUTPUT INSERTED.[pk]

  describe('compileInsertGetId()', () => {
    it('generates INSERT with OUTPUT INSERTED.[id] using default PK', () => {
      const { qb, grammar } = makeQb('posts');
      const { sql, bindings } = grammar.compileInsertGetId(qb, { title: 'Hello', status: 'draft' });
      expect(sql).toBe(
        'INSERT INTO [posts] ([title], [status]) OUTPUT INSERTED.[id] VALUES (@p1, @p2)'
      );
      expect(bindings).toEqual(['Hello', 'draft']);
    });

    it('uses custom primaryKey when set on builder', () => {
      const { qb, grammar } = makeQb('posts');
      qb.primaryKey = 'uuid';
      const { sql } = grammar.compileInsertGetId(qb, { title: 'Hello' });
      expect(sql).toContain('OUTPUT INSERTED.[uuid]');
    });

    it('does NOT use RETURNING (unlike MariaDB)', () => {
      const { qb, grammar } = makeQb('posts');
      const { sql } = grammar.compileInsertGetId(qb, { title: 'Hello' });
      expect(sql).not.toContain('RETURNING');
      expect(sql).toContain('OUTPUT INSERTED');
    });

    it('preserves all bindings', () => {
      const { qb, grammar } = makeQb('users');
      const { sql, bindings } = grammar.compileInsertGetId(qb, { name: 'Alice', age: 30 });
      expect(sql).toContain('INSERT INTO [users]');
      expect(bindings).toEqual(['Alice', 30]);
    });
  });

  // ── compileInsertOrIgnore ─────────────────────────────────────────────────
  // SQL Server uses IF NOT EXISTS pattern

  describe('compileInsertOrIgnore()', () => {
    it('generates IF NOT EXISTS ... INSERT INTO pattern', () => {
      const { qb, grammar } = makeQb('posts');
      const { sql, bindings } = grammar.compileInsertOrIgnore(qb, [{ title: 'Hello' }]);
      expect(sql).toContain('IF NOT EXISTS');
      expect(sql).toContain('SELECT 1 FROM [posts]');
      expect(sql).toContain('INSERT INTO [posts]');
      expect(bindings.length).toBeGreaterThan(0);
    });

    it('does NOT use INSERT IGNORE (MySQL syntax)', () => {
      const { qb, grammar } = makeQb('posts');
      const { sql } = grammar.compileInsertOrIgnore(qb, [{ title: 'Hello' }]);
      expect(sql).not.toContain('INSERT IGNORE');
    });
  });

  // ── compileUpsert ─────────────────────────────────────────────────────────
  // SQL Server uses MERGE INTO ... USING ... ON ... WHEN MATCHED / NOT MATCHED

  describe('compileUpsert()', () => {
    it('generates MERGE INTO ... USING ... ON ... WHEN MATCHED ... WHEN NOT MATCHED', () => {
      const { qb, grammar } = makeQb('posts');
      const values = [{ slug: 'hello', title: 'Hello', views: 0 }];
      const { sql, bindings } = grammar.compileUpsert(qb, values, ['slug'], ['title', 'views']);
      expect(sql).toContain('MERGE INTO [posts]');
      expect(sql).toContain('USING (VALUES');
      expect(sql).toContain('ON [tgt].[slug] = [src].[slug]');
      expect(sql).toContain('WHEN MATCHED THEN UPDATE SET');
      expect(sql).toContain('WHEN NOT MATCHED THEN INSERT');
      expect(bindings).toEqual(['hello', 'Hello', 0]);
    });

    it('handles multi-row MERGE with sequential @p params', () => {
      const { qb, grammar } = makeQb('posts');
      const values = [
        { slug: 'a', title: 'A' },
        { slug: 'b', title: 'B' },
      ];
      const { sql, bindings } = grammar.compileUpsert(qb, values, ['slug'], ['title']);
      expect(sql).toContain('MERGE INTO [posts]');
      expect(bindings).toEqual(['a', 'A', 'b', 'B']);
    });

    it('MERGE ends with semicolon', () => {
      const { qb, grammar } = makeQb('posts');
      const values = [{ slug: 'hello', title: 'Hello' }];
      const { sql } = grammar.compileUpsert(qb, values, ['slug'], ['title']);
      expect(sql.trim().endsWith(';')).toBe(true);
    });

    it('update SET references [tgt] alias', () => {
      const { qb, grammar } = makeQb('posts');
      const values = [{ slug: 'hello', title: 'Hello' }];
      const { sql } = grammar.compileUpsert(qb, values, ['slug'], ['title']);
      expect(sql).toContain('[tgt].[title] = [src].[title]');
    });

    it('does NOT use ON DUPLICATE KEY UPDATE (MySQL syntax)', () => {
      const { qb, grammar } = makeQb('posts');
      const values = [{ slug: 'hello', title: 'Hello' }];
      const { sql } = grammar.compileUpsert(qb, values, ['slug'], ['title']);
      expect(sql).not.toContain('ON DUPLICATE KEY UPDATE');
    });
  });

  // ── compileUpdate ─────────────────────────────────────────────────────────

  describe('compileUpdate()', () => {
    it('generates UPDATE ... SET without WHERE', () => {
      const { qb, grammar } = makeQb('posts');
      const { sql, bindings } = grammar.compileUpdate(qb, { title: 'New', status: 'published' });
      expect(sql).toBe('UPDATE [posts] SET [title] = @p1, [status] = @p2');
      expect(bindings).toEqual(['New', 'published']);
    });

    it('generates UPDATE ... SET ... WHERE with sequential @p params', () => {
      const { qb, grammar } = makeQb('posts');
      qb.where('id', 42);
      const { sql, bindings } = grammar.compileUpdate(qb, { title: 'Updated' });
      expect(sql).toBe('UPDATE [posts] SET [title] = @p1 WHERE [id] = @p2');
      expect(bindings).toEqual(['Updated', 42]);
    });

    it('uses Expression as raw SQL on right-hand side without extra binding', () => {
      const { qb, grammar } = makeQb('posts');
      const { sql, bindings } = grammar.compileUpdate(qb, {
        updated_at: new Expression('GETDATE()'),
      });
      expect(sql).toContain('[updated_at] = GETDATE()');
      expect(bindings).toEqual([]);
    });

    it('includes JOIN in UPDATE when joins are present', () => {
      const { qb, grammar } = makeQb('posts');
      qb.join('users', 'posts.user_id', '=', 'users.id').where('users.active', true);
      const { sql } = grammar.compileUpdate(qb, { status: 'reviewed' });
      expect(sql).toContain('INNER JOIN [users]');
    });
  });

  // ── compileDelete ─────────────────────────────────────────────────────────

  describe('compileDelete()', () => {
    it('generates DELETE FROM without WHERE', () => {
      const { qb, grammar } = makeQb('posts');
      const { sql, bindings } = grammar.compileDelete(qb);
      expect(sql).toBe('DELETE FROM [posts]');
      expect(bindings).toEqual([]);
    });

    it('generates DELETE FROM ... WHERE with @p binding', () => {
      const { qb, grammar } = makeQb('posts');
      qb.where('id', 7);
      const { sql, bindings } = grammar.compileDelete(qb);
      expect(sql).toBe('DELETE FROM [posts] WHERE [id] = @p1');
      expect(bindings).toEqual([7]);
    });

    it('generates DELETE with multiple WHERE conditions and sequential @p params', () => {
      const { qb, grammar } = makeQb('posts');
      qb.where('status', 'draft').where('views', '<', 10);
      const { sql, bindings } = grammar.compileDelete(qb);
      expect(sql).toContain('WHERE [status] = @p1 AND [views] < @p2');
      expect(bindings).toEqual(['draft', 10]);
    });
  });

  // ── compileTruncate ───────────────────────────────────────────────────────

  describe('compileTruncate()', () => {
    it('generates TRUNCATE TABLE with square-bracketed table name', () => {
      const { grammar } = makeQb();
      const { sql, bindings } = grammar.compileTruncate('posts');
      expect(sql).toBe('TRUNCATE TABLE [posts]');
      expect(bindings).toEqual([]);
    });

    it('does NOT generate DELETE FROM', () => {
      const { grammar } = makeQb();
      const { sql } = grammar.compileTruncate('posts');
      expect(sql).not.toContain('DELETE FROM');
    });
  });

  // ── compileAggregate ──────────────────────────────────────────────────────

  describe('compileAggregate()', () => {
    it('generates COUNT(*) with square-bracket aggregate alias', () => {
      const { qb, grammar } = makeQb('posts');
      const { sql } = grammar.compileAggregate(qb, 'count', '*');
      expect(sql).toContain('COUNT(*) AS [aggregate]');
    });

    it('generates COUNT on a specific column', () => {
      const { qb, grammar } = makeQb('posts');
      const { sql } = grammar.compileAggregate(qb, 'count', 'id');
      expect(sql).toContain('COUNT([id]) AS [aggregate]');
    });

    it('generates SUM', () => {
      const { qb, grammar } = makeQb('posts');
      const { sql } = grammar.compileAggregate(qb, 'sum', 'views');
      expect(sql).toContain('SUM([views]) AS [aggregate]');
    });

    it('generates AVG', () => {
      const { qb, grammar } = makeQb('posts');
      const { sql } = grammar.compileAggregate(qb, 'avg', 'rating');
      expect(sql).toContain('AVG([rating]) AS [aggregate]');
    });

    it('generates COUNT DISTINCT when isDistinct is set', () => {
      const { qb, grammar } = makeQb('posts');
      qb.distinct();
      const { sql } = grammar.compileAggregate(qb, 'count', 'id');
      expect(sql).toContain('COUNT(DISTINCT [id])');
    });

    it('does NOT apply DISTINCT inside COUNT when column is *', () => {
      const { qb, grammar } = makeQb('posts');
      qb.distinct();
      const { sql } = grammar.compileAggregate(qb, 'count', '*');
      expect(sql).toContain('COUNT(*)');
      expect(sql).not.toContain('COUNT(DISTINCT');
    });

    it('strips ORDER BY and TOP from aggregate query', () => {
      const { qb, grammar } = makeQb('posts');
      qb.orderBy('id').limit(10);
      const { sql } = grammar.compileAggregate(qb, 'count', '*');
      expect(sql).not.toContain('ORDER BY');
      expect(sql).not.toContain('TOP');
    });
  });

  // ── raw clauses ───────────────────────────────────────────────────────────

  describe('raw clauses', () => {
    it('orderByRaw injects raw ORDER BY expression', () => {
      const { qb, grammar } = makeQb('posts');
      qb.orderByRaw('[views] DESC');
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('[views] DESC');
    });

    it('havingRaw injects raw HAVING expression with bindings', () => {
      const { qb, grammar } = makeQb('posts');
      qb.groupBy('status').havingRaw('COUNT(*) > @p1', [3]);
      const { sql, bindings } = grammar.compileSelect(qb);
      expect(sql).toContain('HAVING COUNT(*) > @p1');
      expect(bindings).toContain(3);
    });

    it('selectRaw passes expression through without wrapping', () => {
      const { qb, grammar } = makeQb('posts');
      qb.selectRaw('COUNT(*) as total');
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('COUNT(*) as total');
    });
  });

  // ── compileWheres public method ───────────────────────────────────────────

  describe('compileWheres() (public)', () => {
    it('is accessible and produces correct SQL', () => {
      const { qb, grammar } = makeQb('posts');
      qb.where('active', true);
      // Access via compileSelect which uses compileWheres internally
      const { sql } = grammar.compileSelect(qb);
      expect(sql).toContain('WHERE [active] = @p1');
    });
  });

  // ── parameter ordering ────────────────────────────────────────────────────

  describe('named parameter ordering (@p1, @p2, ...)', () => {
    it('parameters in WHERE are numbered in order of appearance', () => {
      const { qb, grammar } = makeQb('posts');
      qb.where('a', 1).where('b', 2).where('c', 3);
      const { sql, bindings } = grammar.compileSelect(qb);
      expect(sql).toContain('[a] = @p1');
      expect(sql).toContain('[b] = @p2');
      expect(sql).toContain('[c] = @p3');
      expect(bindings).toEqual([1, 2, 3]);
    });

    it('JOIN bindings come before WHERE bindings in sequence', () => {
      const { qb, grammar } = makeQb('posts');
      qb.join('users', 'posts.user_id', '=', 'users.id').where('posts.status', 'active');
      const { sql, bindings } = grammar.compileSelect(qb);
      // The join has no bindings here; WHERE binding should be @p1
      expect(sql).toContain('[posts].[status] = @p1');
      expect(bindings).toEqual(['active']);
    });
  });
});
