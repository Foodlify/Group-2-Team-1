import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { AppError } from "./error.middleware";
import { asyncHandler } from "../utils/asyncHandler";
import { verifyAccessToken } from "../shared/auth/jwt.helper";
import { userErrors } from "../shared/exceptions/user.errors";
import { userRepository } from "../modules/user/user.repository";
import { setContextActor } from "../shared/context/request.context";

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
      payload = verifyAccessToken(token);
    } catch {
      throw new AppError("Invalid or expired token", StatusCodes.UNAUTHORIZED);
    }

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

    req.user = { ...payload, role: user.role };

    setContextActor(user.id, user.role);
    next();
  },
);

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
