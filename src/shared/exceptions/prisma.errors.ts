export const isForeignKeyViolation = (e: unknown): boolean =>
  typeof e === "object" &&
  e !== null &&
  (e as { code?: unknown }).code === "P2003";

export const isUniqueViolation = (
  e: unknown,
): e is { code: "P2002"; meta?: unknown } =>
  typeof e === "object" &&
  e !== null &&
  (e as { code?: unknown }).code === "P2002";

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
