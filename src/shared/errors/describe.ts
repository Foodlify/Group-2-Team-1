/**
 * Renders an unknown thrown value into something a JSON log can actually show.
 *
 * `logger.error("...", { error })` looks right and is nearly useless: `Error`
 * has no enumerable properties, so `JSON.stringify` turns it into `{}`. That
 * was found the hard way — a live "Gateway refund failed — money is still
 * owed" line arrived with `"error":{}` and no reason attached.
 */
export const describeError = (
  error: unknown,
): { message: string; stack?: string; name?: string } => {
  if (error instanceof Error) {
    return { message: error.message, name: error.name, stack: error.stack };
  }
  return { message: String(error) };
};
