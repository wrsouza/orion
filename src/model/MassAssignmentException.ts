export class MassAssignmentException extends Error {
  constructor(key: string, modelName: string) {
    super(`[orion] Add [${key}] to fillable on [${modelName}] to allow mass assignment.`);
    this.name = 'MassAssignmentException';
  }
}
