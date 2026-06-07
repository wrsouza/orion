import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectionManager } from '../../src/connection/ConnectionManager';
import { ModelBuilder } from '../../src/model/ModelBuilder';
import { Model } from '../../src/model/Model';
import { table } from '../../src/model/decorators/table';
import { SQLiteQueryGrammar } from '../../src/query/grammars/SQLiteQueryGrammar';

// ── Mock connection ────────────────────────────────────────────────────────────

const mockConn = {
  query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0, fields: [] }),
  transaction: vi.fn(),
  disconnect: vi.fn().mockResolvedValue(undefined),
  isConnected: vi.fn().mockReturnValue(true),
  getGrammar: vi.fn().mockReturnValue(new SQLiteQueryGrammar()),
};

// Inject the mock connection directly into the private registry
(ConnectionManager as any).connections.set('mock_mb', mockConn);

// ── Test model ─────────────────────────────────────────────────────────────────

@table({ name: 'mb_items', timestamps: false, connection: 'mock_mb' })
class MbItem extends Model {}

// ── Helpers ────────────────────────────────────────────────────────────────────

function freshBuilder(): ModelBuilder<MbItem> {
  return MbItem.query() as unknown as ModelBuilder<MbItem>;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('ModelBuilder — fluent query building (no DB)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── SELECT ──────────────────────────────────────────────────────────────────

  describe('select()', () => {
    it('selects explicit columns (varargs)', () => {
      const { sql } = freshBuilder().select('id', 'name').toSql();
      expect(sql).toContain('"id"');
      expect(sql).toContain('"name"');
    });

    it('selects a single column', () => {
      const { sql } = freshBuilder().select('email').toSql();
      expect(sql).toContain('"email"');
    });

    it('returns this for chaining', () => {
      const b = freshBuilder();
      expect(b.select('id')).toBe(b);
    });
  });

  // ── WHERE ───────────────────────────────────────────────────────────────────

  describe('where()', () => {
    it('generates WHERE equality clause', () => {
      const { sql, bindings } = freshBuilder().where('status', 'active').toSql();
      expect(sql).toContain('WHERE');
      expect(sql).toContain('"status"');
      expect(bindings).toContain('active');
    });

    it('generates WHERE with explicit operator', () => {
      const { sql, bindings } = freshBuilder().where('age', '>', 18).toSql();
      expect(sql).toContain('>');
      expect(bindings).toContain(18);
    });

    it('returns this for chaining', () => {
      const b = freshBuilder();
      expect(b.where('id', 1)).toBe(b);
    });
  });

  describe('orWhere()', () => {
    it('generates OR WHERE clause', () => {
      const { sql } = freshBuilder().where('a', 1).orWhere('b', 2).toSql();
      expect(sql).toContain('OR');
      expect(sql).toContain('"b"');
    });

    it('supports explicit operator', () => {
      const { sql, bindings } = freshBuilder().where('x', 1).orWhere('y', '<', 5).toSql();
      expect(sql).toContain('<');
      expect(bindings).toContain(5);
    });
  });

  // ── WHERE IN ────────────────────────────────────────────────────────────────

  describe('whereIn()', () => {
    it('generates WHERE IN clause', () => {
      const { sql, bindings } = freshBuilder().whereIn('id', [1, 2, 3]).toSql();
      expect(sql).toContain('IN');
      expect(bindings).toEqual(expect.arrayContaining([1, 2, 3]));
    });

    it('returns this for chaining', () => {
      const b = freshBuilder();
      expect(b.whereIn('id', [1])).toBe(b);
    });
  });

  describe('whereNotIn()', () => {
    it('generates WHERE NOT IN clause', () => {
      const { sql, bindings } = freshBuilder().whereNotIn('id', [4, 5]).toSql();
      expect(sql).toContain('NOT IN');
      expect(bindings).toEqual(expect.arrayContaining([4, 5]));
    });
  });

  // ── WHERE NULL ──────────────────────────────────────────────────────────────

  describe('whereNull()', () => {
    it('generates IS NULL clause', () => {
      const { sql } = freshBuilder().whereNull('deleted_at').toSql();
      expect(sql).toContain('IS NULL');
      expect(sql).toContain('"deleted_at"');
    });
  });

  describe('whereNotNull()', () => {
    it('generates IS NOT NULL clause', () => {
      const { sql } = freshBuilder().whereNotNull('email').toSql();
      expect(sql).toContain('IS NOT NULL');
      expect(sql).toContain('"email"');
    });
  });

  describe('orWhereNull()', () => {
    it('generates OR IS NULL clause', () => {
      const { sql } = freshBuilder().where('x', 1).orWhereNull('deleted_at').toSql();
      expect(sql).toContain('OR');
      expect(sql).toContain('IS NULL');
    });
  });

  describe('orWhereNotNull()', () => {
    it('generates OR IS NOT NULL clause', () => {
      const { sql } = freshBuilder().where('x', 1).orWhereNotNull('email').toSql();
      expect(sql).toContain('OR');
      expect(sql).toContain('IS NOT NULL');
    });
  });

  // ── ORDER BY ────────────────────────────────────────────────────────────────

  describe('orderBy()', () => {
    it('generates ORDER BY ASC', () => {
      const { sql } = freshBuilder().orderBy('name', 'asc').toSql();
      expect(sql).toContain('ORDER BY');
      expect(sql).toContain('"name"');
      expect(sql.toUpperCase()).toContain('ASC');
    });

    it('defaults to asc when direction omitted', () => {
      const { sql } = freshBuilder().orderBy('name').toSql();
      expect(sql.toUpperCase()).toContain('ASC');
    });

    it('returns this for chaining', () => {
      const b = freshBuilder();
      expect(b.orderBy('name')).toBe(b);
    });
  });

  describe('orderByDesc()', () => {
    it('generates ORDER BY DESC', () => {
      const { sql } = freshBuilder().orderByDesc('created_at').toSql();
      expect(sql).toContain('ORDER BY');
      expect(sql).toContain('"created_at"');
      expect(sql.toUpperCase()).toContain('DESC');
    });
  });

  describe('latest()', () => {
    it('orders by created_at desc by default', () => {
      const { sql } = freshBuilder().latest().toSql();
      expect(sql).toContain('"created_at"');
      expect(sql.toUpperCase()).toContain('DESC');
    });

    it('accepts a custom column', () => {
      const { sql } = freshBuilder().latest('updated_at').toSql();
      expect(sql).toContain('"updated_at"');
    });
  });

  describe('oldest()', () => {
    it('orders by created_at asc by default', () => {
      const { sql } = freshBuilder().oldest().toSql();
      expect(sql).toContain('"created_at"');
      expect(sql.toUpperCase()).toContain('ASC');
    });

    it('accepts a custom column', () => {
      const { sql } = freshBuilder().oldest('published_at').toSql();
      expect(sql).toContain('"published_at"');
    });
  });

  // ── LIMIT / OFFSET ──────────────────────────────────────────────────────────

  describe('limit()', () => {
    it('adds LIMIT clause', () => {
      const { sql } = freshBuilder().limit(10).toSql();
      expect(sql).toContain('LIMIT 10');
    });

    it('returns this for chaining', () => {
      const b = freshBuilder();
      expect(b.limit(5)).toBe(b);
    });
  });

  describe('offset()', () => {
    it('adds OFFSET clause', () => {
      const { sql } = freshBuilder().offset(20).toSql();
      expect(sql).toContain('OFFSET 20');
    });

    it('returns this for chaining', () => {
      const b = freshBuilder();
      expect(b.offset(10)).toBe(b);
    });
  });

  describe('forPage()', () => {
    it('applies correct LIMIT and OFFSET for page 1', () => {
      const { sql } = freshBuilder().forPage(1, 15).toSql();
      expect(sql).toContain('LIMIT 15');
      expect(sql).toContain('OFFSET 0');
    });

    it('applies correct LIMIT and OFFSET for page 3', () => {
      const { sql } = freshBuilder().forPage(3, 10).toSql();
      expect(sql).toContain('LIMIT 10');
      expect(sql).toContain('OFFSET 20');
    });

    it('returns this for chaining', () => {
      const b = freshBuilder();
      expect(b.forPage(2, 10)).toBe(b);
    });
  });

  // ── EAGER LOADING ───────────────────────────────────────────────────────────

  describe('with()', () => {
    it('stores a single relation name in _eagerLoads', () => {
      const b = freshBuilder().with('author');
      expect((b as any)._eagerLoads.has('author')).toBe(true);
    });

    it('stores multiple relation names from an array', () => {
      const b = freshBuilder().with(['author', 'comments']);
      expect((b as any)._eagerLoads.has('author')).toBe(true);
      expect((b as any)._eagerLoads.has('comments')).toBe(true);
    });

    it('stores a constrained relation from an object', () => {
      const cb = () => {};
      const b = freshBuilder().with({ comments: cb });
      expect((b as any)._eagerLoads.get('comments')).toBe(cb);
    });

    it('does not affect the generated SQL', () => {
      const { sql } = freshBuilder().with('author').toSql();
      expect(sql).toBe('SELECT * FROM "mb_items"');
    });

    it('returns this for chaining', () => {
      const b = freshBuilder();
      expect(b.with('author')).toBe(b);
    });
  });

  // ── GLOBAL SCOPES ───────────────────────────────────────────────────────────

  describe('withoutGlobalScope()', () => {
    it('adds the scope name to _removedScopes', () => {
      const b = freshBuilder().withoutGlobalScope('SoftDeleteScope');
      expect((b as any)._removedScopes.has('SoftDeleteScope')).toBe(true);
    });

    it('does not throw for unknown scope names', () => {
      expect(() => freshBuilder().withoutGlobalScope('NonExistentScope')).not.toThrow();
    });

    it('returns this for chaining', () => {
      const b = freshBuilder();
      expect(b.withoutGlobalScope('someScope')).toBe(b);
    });
  });

  describe('withoutGlobalScopes()', () => {
    it('adds multiple scope names when array is provided', () => {
      const b = freshBuilder().withoutGlobalScopes(['ScopeA', 'ScopeB']);
      expect((b as any)._removedScopes.has('ScopeA')).toBe(true);
      expect((b as any)._removedScopes.has('ScopeB')).toBe(true);
    });

    it('returns this for chaining', () => {
      const b = freshBuilder();
      expect(b.withoutGlobalScopes(['ScopeX'])).toBe(b);
    });
  });

  // ── toSql() ─────────────────────────────────────────────────────────────────

  describe('toSql()', () => {
    it('returns an object with sql and bindings', () => {
      const result = freshBuilder().toSql();
      expect(result).toHaveProperty('sql');
      expect(result).toHaveProperty('bindings');
    });

    it('generates the correct base SELECT for the model table', () => {
      const { sql } = freshBuilder().toSql();
      expect(sql).toBe('SELECT * FROM "mb_items"');
    });

    it('does not execute a database query', () => {
      freshBuilder().where('id', 1).toSql();
      expect(mockConn.query).not.toHaveBeenCalled();
    });

    it('accumulates bindings from multiple where clauses', () => {
      const { bindings } = freshBuilder()
        .where('id', 42)
        .whereIn('status', ['a', 'b'])
        .toSql();
      expect(bindings).toContain(42);
      expect(bindings).toContain('a');
      expect(bindings).toContain('b');
    });
  });

  // ── clone() ──────────────────────────────────────────────────────────────────

  describe('clone()', () => {
    it('returns a new builder instance', () => {
      const b = freshBuilder();
      const c = b.clone();
      expect(c).not.toBe(b);
      expect(c).toBeInstanceOf(ModelBuilder);
    });

    it('clone has independent state from original', () => {
      const b = freshBuilder().where('x', 1);
      const c = b.clone();
      c.where('y', 2);
      const { sql: sqlB } = b.toSql();
      const { sql: sqlC } = c.toSql();
      expect(sqlB).not.toContain('"y"');
      expect(sqlC).toContain('"y"');
    });

    it('preserves _eagerLoads in the clone', () => {
      const b = freshBuilder().with('author');
      const c = b.clone();
      expect((c as any)._eagerLoads.has('author')).toBe(true);
    });

    it('preserves _removedScopes in the clone', () => {
      const b = freshBuilder().withoutGlobalScope('SoftDeleteScope');
      const c = b.clone();
      expect((c as any)._removedScopes.has('SoftDeleteScope')).toBe(true);
    });

    it('clone _eagerLoads is independent from original', () => {
      const b = freshBuilder().with('author');
      const c = b.clone();
      c.with('tags');
      expect((b as any)._eagerLoads.has('tags')).toBe(false);
    });
  });

  // ── Soft-delete helpers ──────────────────────────────────────────────────────

  describe('withTrashed()', () => {
    it('sets _withTrashed to true', () => {
      const b = freshBuilder().withTrashed();
      expect((b as any)._withTrashed).toBe(true);
    });

    it('sets _onlyTrashed to false', () => {
      const b = freshBuilder().onlyTrashed().withTrashed();
      expect((b as any)._onlyTrashed).toBe(false);
    });

    it('removes SoftDeleteScope', () => {
      const b = freshBuilder().withTrashed();
      expect((b as any)._removedScopes.has('SoftDeleteScope')).toBe(true);
    });

    it('returns this for chaining', () => {
      const b = freshBuilder();
      expect(b.withTrashed()).toBe(b);
    });
  });

  describe('onlyTrashed()', () => {
    it('sets _onlyTrashed to true', () => {
      const b = freshBuilder().onlyTrashed();
      expect((b as any)._onlyTrashed).toBe(true);
    });

    it('sets _withTrashed to false', () => {
      const b = freshBuilder().withTrashed().onlyTrashed();
      expect((b as any)._withTrashed).toBe(false);
    });

    it('adds IS NOT NULL for deleted_at', () => {
      const { sql } = freshBuilder().onlyTrashed().toSql();
      expect(sql).toContain('IS NOT NULL');
      expect(sql).toContain('"deleted_at"');
    });

    it('removes SoftDeleteScope', () => {
      const b = freshBuilder().onlyTrashed();
      expect((b as any)._removedScopes.has('SoftDeleteScope')).toBe(true);
    });
  });

  // ── Additional WHERE variants ────────────────────────────────────────────────

  describe('orWhereIn()', () => {
    it('generates OR WHERE IN clause', () => {
      const { sql } = freshBuilder().where('a', 1).orWhereIn('id', [1, 2]).toSql();
      expect(sql).toContain('OR');
      expect(sql).toContain('IN');
    });
  });

  describe('orWhereNotIn()', () => {
    it('generates OR WHERE NOT IN clause', () => {
      const { sql } = freshBuilder().where('a', 1).orWhereNotIn('id', [3]).toSql();
      expect(sql).toContain('OR');
      expect(sql).toContain('NOT IN');
    });
  });

  describe('whereBetween()', () => {
    it('generates BETWEEN clause', () => {
      const { sql, bindings } = freshBuilder().whereBetween('age', [18, 65]).toSql();
      expect(sql).toContain('BETWEEN');
      expect(bindings).toContain(18);
      expect(bindings).toContain(65);
    });
  });

  describe('whereNotBetween()', () => {
    it('generates NOT BETWEEN clause', () => {
      const { sql } = freshBuilder().whereNotBetween('age', [0, 17]).toSql();
      expect(sql).toContain('NOT BETWEEN');
    });
  });

  describe('whereRaw()', () => {
    it('includes raw SQL fragment', () => {
      const { sql, bindings } = freshBuilder().whereRaw('id > ?', [10]).toSql();
      expect(sql).toContain('id > ?');
      expect(bindings).toContain(10);
    });
  });

  describe('orWhereRaw()', () => {
    it('includes raw SQL fragment with OR', () => {
      const { sql } = freshBuilder().where('x', 1).orWhereRaw('y > ?', [5]).toSql();
      expect(sql).toContain('OR');
      expect(sql).toContain('y > ?');
    });
  });

  describe('distinct()', () => {
    it('adds DISTINCT to the query', () => {
      const { sql } = freshBuilder().distinct().toSql();
      expect(sql).toContain('DISTINCT');
    });
  });

  describe('groupBy()', () => {
    it('adds GROUP BY clause', () => {
      const { sql } = freshBuilder().groupBy('status').toSql();
      expect(sql).toContain('GROUP BY');
      expect(sql).toContain('"status"');
    });

    it('supports multiple columns', () => {
      const { sql } = freshBuilder().groupBy('status', 'type').toSql();
      expect(sql).toContain('"status"');
      expect(sql).toContain('"type"');
    });
  });

  describe('having()', () => {
    it('adds HAVING clause', () => {
      const { sql, bindings } = freshBuilder()
        .groupBy('status')
        .having('count', '>', 5)
        .toSql();
      expect(sql).toContain('HAVING');
      expect(bindings).toContain(5);
    });
  });

  describe('orderByRaw()', () => {
    it('adds a raw ORDER BY expression', () => {
      const { sql } = freshBuilder().orderByRaw('FIELD(status, "a", "b")').toSql();
      expect(sql).toContain('ORDER BY');
      expect(sql).toContain('FIELD(status');
    });
  });

  describe('skip() / take()', () => {
    it('skip() is alias for offset()', () => {
      const { sql } = freshBuilder().skip(5).toSql();
      expect(sql).toContain('OFFSET 5');
    });

    it('take() is alias for limit()', () => {
      const { sql } = freshBuilder().take(7).toSql();
      expect(sql).toContain('LIMIT 7');
    });
  });

  describe('addSelect()', () => {
    it('appends additional columns to existing select', () => {
      const { sql } = freshBuilder().select('id').addSelect('name').toSql();
      expect(sql).toContain('"id"');
      expect(sql).toContain('"name"');
    });
  });

  describe('selectRaw()', () => {
    it('adds a raw select expression', () => {
      const { sql } = freshBuilder().selectRaw('COUNT(*) as cnt').toSql();
      expect(sql).toContain('COUNT(*) as cnt');
    });
  });

  describe('withCasts()', () => {
    it('stores extra casts and returns this', () => {
      const b = freshBuilder();
      const result = b.withCasts({ price: 'number' as any });
      expect(result).toBe(b);
      expect((b as any)._extraCasts).toMatchObject({ price: 'number' });
    });

    it('merges additional casts on successive calls', () => {
      const b = freshBuilder()
        .withCasts({ price: 'number' as any })
        .withCasts({ qty: 'number' as any });
      expect((b as any)._extraCasts).toMatchObject({ price: 'number', qty: 'number' });
    });
  });

  describe('from()', () => {
    it('overrides the default table', () => {
      const { sql } = freshBuilder().from('other_table').toSql();
      expect(sql).toContain('"other_table"');
    });
  });

  describe('whereColumn()', () => {
    it('generates a column comparison clause', () => {
      const { sql } = freshBuilder().whereColumn('first_name', 'last_name').toSql();
      expect(sql).toContain('"first_name"');
      expect(sql).toContain('"last_name"');
    });
  });

  describe('join()', () => {
    it('generates an INNER JOIN clause', () => {
      const { sql } = freshBuilder()
        .join('users', 'mb_items.user_id', '=', 'users.id')
        .toSql();
      expect(sql).toContain('JOIN');
      expect(sql).toContain('"users"');
    });
  });

  describe('leftJoin()', () => {
    it('generates a LEFT JOIN clause', () => {
      const { sql } = freshBuilder()
        .leftJoin('users', 'mb_items.user_id', '=', 'users.id')
        .toSql();
      expect(sql).toContain('LEFT');
      expect(sql).toContain('JOIN');
    });
  });
});
