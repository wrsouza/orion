import { Connection } from '../connection/Connection';
import { ConnectionManager } from '../connection/ConnectionManager';
import { Blueprint } from './Blueprint';
import { PostgresSchemaGrammar } from './grammars/PostgresSchemaGrammar';
import { SchemaGrammar } from './grammars/SchemaGrammar';

/**
 * Facade for DDL operations (Data Definition Language).
 *
 * Every method accepts an optional `connectionName` to target a specific
 * registered connection; if omitted, the default connection is used.
 *
 * @example
 * ```ts
 * await Schema.create('users', (table) => {
 *   table.id();
 *   table.string('email').unique();
 *   table.timestamps();
 * });
 * ```
 */
export class Schema {
  private static grammar: SchemaGrammar = new PostgresSchemaGrammar();

  static useGrammar(grammar: SchemaGrammar): void {
    this.grammar = grammar;
  }

  private static getConnection(connectionName?: string): Connection {
    return ConnectionManager.getConnection(connectionName);
  }

  static async create(
    table: string,
    callback: (blueprint: Blueprint) => void,
    connectionName?: string
  ): Promise<void> {
    const bp = new Blueprint(table);
    callback(bp);

    const compiled = this.grammar.compileCreate(bp);
    const conn = this.getConnection(connectionName);

    if (compiled.createTable) {
      await conn.query(compiled.createTable);
    }

    for (const sql of compiled.indexes) {
      await conn.query(sql);
    }

    for (const sql of compiled.foreignKeys) {
      await conn.query(sql);
    }
  }

  static async table(
    table: string,
    callback: (blueprint: Blueprint) => void,
    connectionName?: string
  ): Promise<void> {
    const bp = new Blueprint(table);
    callback(bp);

    const compiled = this.grammar.compileAlter(bp);
    const conn = this.getConnection(connectionName);

    for (const sql of compiled.alterTable ?? []) {
      await conn.query(sql);
    }

    for (const sql of compiled.indexes) {
      await conn.query(sql);
    }

    for (const sql of compiled.foreignKeys) {
      await conn.query(sql);
    }
  }

  static async drop(table: string, connectionName?: string): Promise<void> {
    const sql = this.grammar.compileDrop(table);
    await this.getConnection(connectionName).query(sql);
  }

  static async dropIfExists(table: string, connectionName?: string): Promise<void> {
    const sql = this.grammar.compileDropIfExists(table);
    await this.getConnection(connectionName).query(sql);
  }

  static async hasTable(table: string, connectionName?: string): Promise<boolean> {
    const sql = this.grammar.compileTableExists(table);
    const result = await this.getConnection(connectionName).query(sql);
    return result.rows[0]?.['exists'] === true;
  }

  static async hasColumn(table: string, column: string, connectionName?: string): Promise<boolean> {
    const columns = await this.getColumnListing(table, connectionName);
    return columns.includes(column);
  }

  static async getColumnListing(table: string, connectionName?: string): Promise<string[]> {
    const sql = this.grammar.compileColumnListing(table);
    const result = await this.getConnection(connectionName).query(sql);
    return result.rows.map((row) => row['column_name'] as string);
  }
}
