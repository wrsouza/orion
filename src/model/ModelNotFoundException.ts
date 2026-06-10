export class ModelNotFoundException extends Error {
  constructor(modelName: string, id?: unknown) {
    super(
      id !== undefined
        ? `[orion] No query results for model [${modelName}] with key ${id}.`
        : `[orion] No query results for model [${modelName}].`
    );
    this.name = 'ModelNotFoundException';
  }
}
