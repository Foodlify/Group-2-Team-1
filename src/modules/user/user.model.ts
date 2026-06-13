import type { UserModel } from "../../generated/prisma/models";

/**
 * User shape that is safe to return in API responses — never exposes the
 * password hash or the stored refresh token.
 */
export type SafeUser = Omit<UserModel, "password" | "refreshToken">;
