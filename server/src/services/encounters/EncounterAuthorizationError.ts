export class EncounterAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EncounterAuthorizationError";
  }
}
