export type IndexType = 'index' | 'unique' | 'primary' | 'fulltext';

export class IndexDefinition {
  readonly columns: string[];
  readonly type: IndexType;
  name?: string;

  constructor(columns: string | string[], type: IndexType, name?: string) {
    this.columns = Array.isArray(columns) ? columns : [columns];
    this.type = type;
    this.name = name;
  }
}
