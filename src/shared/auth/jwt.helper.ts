import crypto from "crypto";
import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import env from "../../config/env";

export interface AccessTokenPayload {
  id: string;
  email: string;
  role: string;
  type: "access";
}

export interface RefreshTokenPayload {
  id: string;
  type: "refresh";
}

const refreshSecret = env.JWT_REFRESH_SECRET ?? env.JWT_SECRET;
const accessExpires = env.JWT_ACCESS_EXPIRES as SignOptions["expiresIn"];
const refreshExpires = env.JWT_REFRESH_EXPIRES as SignOptions["expiresIn"];

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
  jwt.sign(
    { ...payload, type: "refresh", jti: crypto.randomUUID() },
    refreshSecret,
    { expiresIn: refreshExpires },
  );

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

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

export const hashToken = (token: string): string =>
  crypto.createHash("sha256").update(token).digest("hex");
