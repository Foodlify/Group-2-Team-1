import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

/** Hashes a plaintext password with bcrypt. */
export const hashPassword = (plain: string): Promise<string> =>
  bcrypt.hash(plain, SALT_ROUNDS);

/** Compares a plaintext password against a bcrypt hash. */
export const comparePassword = (
  plain: string,
  hash: string,
): Promise<boolean> => bcrypt.compare(plain, hash);
