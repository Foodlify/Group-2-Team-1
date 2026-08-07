import type { CookieOptions, Response } from "express";
import env from "../../config/env";
import { ACCESS_TOKEN_TTL_MS, REFRESH_TOKEN_TTL_MS } from "./jwt.helper";

export const ACCESS_COOKIE = "accessToken";
export const REFRESH_COOKIE = "refreshToken";

// Cookie lifetimes (ms) derived from the SAME env values used to sign the
// tokens (JWT_ACCESS_EXPIRES / JWT_REFRESH_EXPIRES) so a cookie never outlives
// or expires before its token.
const ACCESS_MAX_AGE = ACCESS_TOKEN_TTL_MS;
const REFRESH_MAX_AGE = REFRESH_TOKEN_TTL_MS;

const baseOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
});

/** Writes the access + refresh tokens as httpOnly cookies on the response. */
export const setAuthCookies = (
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
): void => {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...baseOptions(),
    maxAge: ACCESS_MAX_AGE,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...baseOptions(),
    maxAge: REFRESH_MAX_AGE,
  });
};

/** Clears the auth cookies (used on logout). */
export const clearAuthCookies = (res: Response): void => {
  res.clearCookie(ACCESS_COOKIE, baseOptions());
  res.clearCookie(REFRESH_COOKIE, baseOptions());
};
