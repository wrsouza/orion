import { Blueprint } from '../Blueprint';

export interface CompiledSchema {
  createTable?: string;
  alterTable?: string[];
  dropTable?: string;
  indexes: string[];
  foreignKeys: string[];
}

export interface SchemaGrammar {
  compileCreate(blueprint: Blueprint): CompiledSchema;
  compileAlter(blueprint: Blueprint): CompiledSchema;
  compileDrop(table: string): string;
  compileDropIfExists(table: string): string;
  compileTableExists(table: string, schema?: string): string;
  compileColumnListing(table: string, schema?: string): string;
}
