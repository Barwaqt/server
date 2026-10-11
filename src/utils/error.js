export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
export function assert(condition, status, message) {
  if (!condition) throw new ApiError(status, message);
}
