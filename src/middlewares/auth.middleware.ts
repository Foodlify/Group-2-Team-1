import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { AppError } from "./error.middleware";
import { asyncHandler } from "../utils/asyncHandler";
import { verifyAccessToken } from "../shared/auth/jwt.helper";

export interface JwtPayload {
  id: string;
  email: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Resolves the access token from the httpOnly cookie first (primary transport),
 * falling back to the `Authorization: Bearer` header for tooling/tests.
 */
const extractAccessToken = (req: Request): string | undefined => {
  const cookieToken = req.cookies?.accessToken as string | undefined;
  if (cookieToken) {
    return cookieToken;
  }
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length);
  }
  return undefined;
};

export const authenticate = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const token = extractAccessToken(req);

    if (!token) {
      throw new AppError("No token provided", StatusCodes.UNAUTHORIZED);
    }

    try {
      // Rejects refresh tokens and malformed payloads — not just any valid JWT.
      req.user = verifyAccessToken(token);
    } catch {
      throw new AppError("Invalid or expired token", StatusCodes.UNAUTHORIZED);
    }

    next();
  },
);

export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new AppError("Not authorized", StatusCodes.FORBIDDEN);
    }
    next();
  };
};
