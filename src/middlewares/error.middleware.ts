import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import logger from "../config/logger";

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;

    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/** Builds an `AppError` from a `{ message, statusCode }` error definition. */
export const appError = (def: {
  message: string;
  statusCode: number;
}): AppError => new AppError(def.message, def.statusCode);

export const errorMiddleware = (
  err: Error | AppError,
  req: Request,
  res: Response,
  // Required for Express to recognise this as an error handler (4-arg arity),
  // even though it is unused.
  _next: NextFunction,
): void => {
  if (err instanceof AppError) {
    logger.warn("Operational error", {
      message: err.message,
      statusCode: err.statusCode,
    });

    res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
    return;
  }

  logger.error("Unexpected error", { message: err.message, stack: err.stack });

  res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
    success: false,
    message: "Internal Server Error",
  });
};
