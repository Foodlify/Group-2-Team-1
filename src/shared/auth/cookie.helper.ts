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

export const OAUTH_STATE_COOKIE = "oauthState";
/**
 * The `state` value only has to survive one redirect to Google and back.
 * Anything longer is a window in which a stale value is still accepted.
 */
const OAUTH_STATE_MAX_AGE = 10 * 60 * 1000;

/**
 * Holds the OAuth `state` between the redirect out and the callback in.
 *
 * A cookie rather than a database row: the value is meaningful only to the
 * browser that started the flow, which is precisely what makes it work as a
 * CSRF defence — an attacker can put their own code in a callback URL, but
 * cannot put their own state in the victim's cookie jar.
 *
 * `sameSite: "lax"` deliberately, not "strict": Google's callback is a
 * cross-site top-level navigation, and a strict cookie would not be sent with
 * it — the flow would fail every time.
 */
export const setOAuthStateCookie = (res: Response, state: string): void => {
  res.cookie(OAUTH_STATE_COOKIE, state, {
    ...baseOptions(),
    maxAge: OAUTH_STATE_MAX_AGE,
  });
};

export const clearOAuthStateCookie = (res: Response): void => {
  res.clearCookie(OAUTH_STATE_COOKIE, baseOptions());
};

/** Clears the auth cookies (used on logout). */
export const clearAuthCookies = (res: Response): void => {
  res.clearCookie(ACCESS_COOKIE, baseOptions());
  res.clearCookie(REFRESH_COOKIE, baseOptions());
};
