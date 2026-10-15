export type ErrorCode = "VALIDATION" | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "RATE_LIMITED";

/** Errors whose message is safe to show to users. Anything else is treated as an unexpected server error. */
export class AppError extends Error {
  constructor(readonly code: ErrorCode, message: string) {
    super(message);
    this.name = "AppError";
  }
}

export const invalid = (m: string) => new AppError("VALIDATION", m);
export const forbidden = (m = "You do not have permission to do that.") => new AppError("FORBIDDEN", m);
// Used for "exists but you may not see it" too, so record existence is not revealed.
export const notFound = (m = "That record was not found.") => new AppError("NOT_FOUND", m);
export const conflict = (m: string) => new AppError("CONFLICT", m);

export function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}
