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

/**
 * Detects a unique-constraint violation (Prisma P2002). Raised on a duplicate
 * value for a `@unique` field (e.g. email/phone already registered).
 */
export const isUniqueViolation = (
  e: unknown,
): e is { code: "P2002"; meta?: unknown } =>
  typeof e === "object" &&
  e !== null &&
  (e as { code?: unknown }).code === "P2002";

/**
 * Given a P2002 error, reports whether the violated constraint involves
 * `field`. Handles Prisma 7's driver-adapter shape
 * (`meta.driverAdapterError.cause.constraint.fields`) and the classic
 * `meta.target` (array or string).
 */
export const uniqueViolationIncludes = (e: unknown, field: string): boolean => {
  const meta = ((e as { meta?: unknown }).meta ?? {}) as {
    target?: unknown;
    driverAdapterError?: { cause?: { constraint?: { fields?: unknown } } };
  };
  const fields = meta.driverAdapterError?.cause?.constraint?.fields;
  if (Array.isArray(fields))
    return fields.some((f) => String(f).includes(field));
  if (Array.isArray(meta.target)) {
    return meta.target.some((t) => String(t).includes(field));
  }
  return typeof meta.target === "string" && meta.target.includes(field);
};
