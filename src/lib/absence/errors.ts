export class AbsenceAccessError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "AbsenceAccessError";
  }
}
