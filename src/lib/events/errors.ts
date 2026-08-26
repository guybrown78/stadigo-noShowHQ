export class EventAccessError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "EventAccessError";
  }
}
