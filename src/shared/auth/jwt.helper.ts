import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import env from "../../config/env";

/**
 * Payload carried by the short-lived access token. Mirrors the shape the
 * `authenticate` middleware attaches to `req.user`.
 */
export interface AccessTokenPayload {
  id: string;
  email: string;
  role: string;
}

/** Minimal payload for the long-lived refresh token. */
export interface RefreshTokenPayload {
  id: string;
}

const refreshSecret = env.JWT_REFRESH_SECRET ?? env.JWT_SECRET;
const accessExpires = env.JWT_ACCESS_EXPIRES as SignOptions["expiresIn"];
const refreshExpires = env.JWT_REFRESH_EXPIRES as SignOptions["expiresIn"];

export const signAccessToken = (payload: AccessTokenPayload): string =>
  jwt.sign(payload, env.JWT_SECRET, { expiresIn: accessExpires });

export const signRefreshToken = (payload: RefreshTokenPayload): string =>
  jwt.sign(payload, refreshSecret, { expiresIn: refreshExpires });

export const verifyAccessToken = (token: string): AccessTokenPayload =>
  jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;

export const verifyRefreshToken = (token: string): RefreshTokenPayload =>
  jwt.verify(token, refreshSecret) as RefreshTokenPayload;
