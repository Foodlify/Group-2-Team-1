import type { CookieOptions, Response } from "express";
import env from "../../config/env";
import { ACCESS_TOKEN_TTL_MS, REFRESH_TOKEN_TTL_MS } from "./jwt.helper";

export const ACCESS_COOKIE = "accessToken";
export const REFRESH_COOKIE = "refreshToken";

const ACCESS_MAX_AGE = ACCESS_TOKEN_TTL_MS;
const REFRESH_MAX_AGE = REFRESH_TOKEN_TTL_MS;

const baseOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
});

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

export const OAUTH_STATE_COOKIE = "oauthState";

const OAUTH_STATE_MAX_AGE = 10 * 60 * 1000;

export const setOAuthStateCookie = (res: Response, state: string): void => {
  res.cookie(OAUTH_STATE_COOKIE, state, {
    ...baseOptions(),
    maxAge: OAUTH_STATE_MAX_AGE,
  });
};

export const clearOAuthStateCookie = (res: Response): void => {
  res.clearCookie(OAUTH_STATE_COOKIE, baseOptions());
};

export const clearAuthCookies = (res: Response): void => {
  res.clearCookie(ACCESS_COOKIE, baseOptions());
  res.clearCookie(REFRESH_COOKIE, baseOptions());
};
