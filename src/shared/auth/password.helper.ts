import bcrypt from "bcryptjs";

// 12 rounds is the current sensible default — meaningfully slower for an
// attacker while staying well within an acceptable per-login cost.
const SALT_ROUNDS = 12;

/** Hashes a plaintext password with bcrypt. */
export const hashPassword = (plain: string): Promise<string> =>
  bcrypt.hash(plain, SALT_ROUNDS);

/** Compares a plaintext password against a bcrypt hash. */
export const comparePassword = (
  plain: string,
  hash: string,
): Promise<boolean> => bcrypt.compare(plain, hash);
