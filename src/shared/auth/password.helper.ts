import bcrypt from "bcrypt";

const SALT_ROUNDS = 12;

export const hashPassword = (plain: string): Promise<string> =>
  bcrypt.hash(plain, SALT_ROUNDS);

export const comparePassword = async (
  plain: string,
  hash: string | null,
): Promise<boolean> => {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
};

export const MAX_PASSWORD_BYTES = 72;
