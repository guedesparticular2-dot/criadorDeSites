export class VersionConflictError extends Error {
  constructor(public readonly expected: number, public readonly actual: number) {
    super(`Conflito de versão: esperado ${expected}, atual ${actual}.`);
    this.name = "VersionConflictError";
  }
}

export function assertExpectedVersion(expected: number, actual: number) {
  if (!Number.isInteger(expected) || expected < 1) throw new TypeError("A versão esperada é inválida.");
  if (expected !== actual) throw new VersionConflictError(expected, actual);
  return actual + 1;
}
