export const describeError = (
  error: unknown,
): { message: string; stack?: string; name?: string } => {
  if (error instanceof Error) {
    return { message: error.message, name: error.name, stack: error.stack };
  }
  return { message: String(error) };
};
