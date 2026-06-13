import crypto from "crypto";
import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import env from "../../config/env";

/**
 * Payload carried by the short-lived access token. Mirrors the shape the
 * `authenticate` middleware attaches to `req.user`. The `type` discriminator
 * prevents a refresh token from being accepted where an access token is
 * required (and vice-versa) even when both share the same signing secret.
 */
export interface AccessTokenPayload {
  id: string;
  email: string;
  role: string;
  type: "access";
}

/** Minimal payload for the long-lived refresh token. */
export interface RefreshTokenPayload {
  id: string;
  type: "refresh";
}

const refreshSecret = env.JWT_REFRESH_SECRET ?? env.JWT_SECRET;
const accessExpires = env.JWT_ACCESS_EXPIRES as SignOptions["expiresIn"];
const refreshExpires = env.JWT_REFRESH_EXPIRES as SignOptions["expiresIn"];

/**
 * Parses a JWT-style duration ("15m", "7d", "12h", "3600") into milliseconds.
 * Single source of truth so cookie `maxAge` stays in lockstep with token
 * expiry — a bare number is treated as seconds (matching `expiresIn` numeric
 * semantics). Throws on an unrecognised format so misconfig fails fast.
 */
export const parseDurationMs = (value: string): number => {
  const match = /^(\d+)\s*(ms|s|m|h|d)?$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid JWT duration: "${value}"`);
  }
  const amount = Number(match[1]);
  const unit = (match[2] ?? "s") as "ms" | "s" | "m" | "h" | "d";
  const factor: Record<"ms" | "s" | "m" | "h" | "d", number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return amount * factor[unit];
};

/** Cookie lifetimes derived from the same env values used to sign the tokens. */
export const ACCESS_TOKEN_TTL_MS = parseDurationMs(env.JWT_ACCESS_EXPIRES);
export const REFRESH_TOKEN_TTL_MS = parseDurationMs(env.JWT_REFRESH_EXPIRES);

export const signAccessToken = (payload: {
  id: string;
  email: string;
  role: string;
}): string =>
  jwt.sign({ ...payload, type: "access" }, env.JWT_SECRET, {
    expiresIn: accessExpires,
  });

export const signRefreshToken = (payload: { id: string }): string =>
  jwt.sign({ ...payload, type: "refresh" }, refreshSecret, {
    expiresIn: refreshExpires,
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/**
 * Verifies an access token AND asserts it is actually an access token with the
 * expected payload shape. Rejects refresh tokens, malformed payloads, and
 * anything missing `id/email/role`.
 */
export const verifyAccessToken = (token: string): AccessTokenPayload => {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (
    !isRecord(decoded) ||
    decoded.type !== "access" ||
    typeof decoded.id !== "string" ||
    typeof decoded.email !== "string" ||
    typeof decoded.role !== "string"
  ) {
    throw new jwt.JsonWebTokenError("Not a valid access token");
  }
  return {
    id: decoded.id,
    email: decoded.email,
    role: decoded.role,
    type: "access",
  };
};

/** Verifies a refresh token and asserts the `type: "refresh"` discriminator. */
export const verifyRefreshToken = (token: string): RefreshTokenPayload => {
  const decoded = jwt.verify(token, refreshSecret);
  if (
    !isRecord(decoded) ||
    decoded.type !== "refresh" ||
    typeof decoded.id !== "string"
  ) {
    throw new jwt.JsonWebTokenError("Not a valid refresh token");
  }
  return { id: decoded.id, type: "refresh" };
};

/**
 * SHA-256 hash of a refresh token for at-rest storage. The token is already
 * high-entropy (a signed JWT), so a fast cryptographic hash is sufficient and
 * lets a DB leak no longer expose usable refresh tokens.
 */
export const hashToken = (token: string): string =>
  crypto.createHash("sha256").update(token).digest("hex");
