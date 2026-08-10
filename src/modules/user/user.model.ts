import type { UserModel } from "../../generated/prisma/models";

export type SafeUser = Omit<UserModel, "password" | "refreshToken">;
