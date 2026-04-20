import { Request, Response, NextFunction } from "express";
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

export const errorMiddleware = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction,
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

  res.status(500).json({
    success: false,
    message: "Internal Server Error",
  });
};
