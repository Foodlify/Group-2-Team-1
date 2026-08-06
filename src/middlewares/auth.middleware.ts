import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { AppError } from "./error.middleware";
import { asyncHandler } from "../utils/asyncHandler";
import { verifyAccessToken } from "../shared/auth/jwt.helper";
import { userErrors } from "../shared/exceptions/user.errors";
import { userRepository } from "../modules/user/user.repository";

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

    let payload;
    try {
      // Rejects refresh tokens and malformed payloads — not just any valid JWT.
      payload = verifyAccessToken(token);
    } catch {
      throw new AppError("Invalid or expired token", StatusCodes.UNAUTHORIZED);
    }

    // Re-resolve the account on every request (same approach as the other
    // teams' projects): a disabled or deleted account stops working
    // immediately instead of surviving until its 15-minute token expires.
    const user = await userRepository.findById(payload.id);
    if (!user) {
      throw new AppError("Invalid or expired token", StatusCodes.UNAUTHORIZED);
    }
    if (!user.isActive) {
      throw new AppError(
        userErrors.ACCOUNT_DISABLED.message,
        userErrors.ACCOUNT_DISABLED.statusCode,
      );
    }

    req.user = payload;
    next();
  },
);

/**
 * Populates `req.user` when a valid access token is present and simply moves
 * on when it isn't — for endpoints open to both signed-in customers and
 * anonymous visitors (the guest cart). A token that IS present but invalid,
 * or belongs to a disabled account, still fails loudly: silently downgrading
 * it to "guest" would hide expired sessions from the client.
 */
export const optionalAuthenticate = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!extractAccessToken(req)) {
      next();
      return;
    }
    await authenticate(req, res, next);
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
