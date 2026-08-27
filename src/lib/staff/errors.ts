export class StaffAccessError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "StaffAccessError";
  }
}
