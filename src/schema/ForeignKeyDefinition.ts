export type ForeignKeyAction = 'CASCADE' | 'SET NULL' | 'SET DEFAULT' | 'RESTRICT' | 'NO ACTION';

export class ForeignKeyDefinition {
  readonly columns: string[];
  referencedTable = '';
  referencedColumns: string[] = [];
  onDeleteAction: ForeignKeyAction = 'RESTRICT';
  onUpdateAction: ForeignKeyAction = 'RESTRICT';
  constraintName?: string;

  constructor(columns: string | string[]) {
    this.columns = Array.isArray(columns) ? columns : [columns];
  }

  references(columns: string | string[]): this {
    this.referencedColumns = Array.isArray(columns) ? columns : [columns];
    return this;
  }

  on(table: string): this {
    this.referencedTable = table;
    return this;
  }

  onDelete(action: ForeignKeyAction): this {
    this.onDeleteAction = action;
    return this;
  }

  onUpdate(action: ForeignKeyAction): this {
    this.onUpdateAction = action;
    return this;
  }

  name(constraintName: string): this {
    this.constraintName = constraintName;
    return this;
  }
}
