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

/**
 * Recognises a failure the *caller* caused, raised by middleware we did not
 * write — chiefly the body parsers: malformed JSON (`400`) and a payload over
 * the limit (`413`). They arrive as `http-errors`, carrying their own status
 * and `expose: true` to mark the message safe to send back.
 *
 * Without this they land in the 500 branch below, which tells the caller their
 * own broken request was a server fault and files it in the log as an
 * unexpected error — an incident that never happened.
 */
const asClientError = (
  err: unknown,
): { status: number; message: string } | null => {
  if (typeof err !== "object" || err === null) return null;
  const candidate = err as Record<string, unknown>;
  if (candidate.expose !== true) return null;

  const raw = candidate.status ?? candidate.statusCode;
  if (typeof raw !== "number" || raw < 400 || raw >= 500) return null;

  return {
    status: raw,
    message:
      typeof candidate.message === "string" && candidate.message.length > 0
        ? candidate.message
        : "Bad Request",
  };
};

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

  const clientError = asClientError(err);
  if (clientError) {
    logger.warn("Malformed request", {
      message: clientError.message,
      statusCode: clientError.status,
    });

    res.status(clientError.status).json({
      success: false,
      message: clientError.message,
    });
    return;
  }

  logger.error("Unexpected error", { message: err.message, stack: err.stack });

  res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
    success: false,
    message: "Internal Server Error",
  });
};
