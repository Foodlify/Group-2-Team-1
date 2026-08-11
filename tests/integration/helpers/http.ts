import request from "supertest";
import app from "../../../src/app";
import prisma from "../../../src/config/prisma";
import { hashPassword } from "../../../src/shared/auth/password.helper";
import {
  signAccessToken,
  signRefreshToken,
} from "../../../src/shared/auth/jwt.helper";
import { ACCESS_COOKIE } from "../../../src/shared/auth/cookie.helper";

export const api = () => request(app);

export const TEST_PASSWORD = "Passw0rd!23";

const hashSuffix = (suffix: string): string => {
  let hash = 0;
  for (const char of suffix)
    hash = (hash * 31 + char.charCodeAt(0)) % 10_000_000;
  return String(hash).padStart(7, "0");
};

export async function createAccount(
  role: "CUSTOMER" | "ADMIN" | "RESTAURANT" = "CUSTOMER",
  overrides: { isActive?: boolean; suffix?: string } = {},
) {
  const suffix = overrides.suffix ?? role.toLowerCase();
  const user = await prisma.user.create({
    data: {
      name: `HTTP ${suffix}`,
      email: `http-${suffix}@example.com`,
      password: await hashPassword(TEST_PASSWORD),
      role,
      emailVerifiedAt: new Date(),
      isActive: overrides.isActive ?? true,
    },
  });
  const customer =
    role === "CUSTOMER"
      ? await prisma.customer.create({
          data: { userId: user.id, phone: `0100${hashSuffix(suffix)}` },
        })
      : null;
  return { user, customer, token: accessTokenFor(user) };
}

export const accessTokenFor = (user: {
  id: string;
  email: string;
  role: string;
}): string =>
  signAccessToken({ id: user.id, email: user.email, role: user.role });

export const refreshTokenFor = (user: { id: string }): string =>
  signRefreshToken({ id: user.id });

export const asCookie = (token: string): string => `${ACCESS_COOKIE}=${token}`;
