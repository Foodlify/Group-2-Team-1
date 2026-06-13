/**
 * Shared Prisma error predicates. Kept transport-agnostic — services translate
 * these into domain `AppError`s so HTTP concerns stay out of the data layer.
 */

/**
 * Detects a foreign-key constraint violation (Prisma P2003). Raised when a row
 * is deleted while still referenced by an `onDelete: Restrict` relation — e.g.
 * deleting a menu item that is part of an existing order or cart.
 */
export const isForeignKeyViolation = (e: unknown): boolean =>
  typeof e === "object" &&
  e !== null &&
  (e as { code?: unknown }).code === "P2003";
