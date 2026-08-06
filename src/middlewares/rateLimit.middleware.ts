import rateLimit, { type Options } from "express-rate-limit";
import { StatusCodes } from "http-status-codes";
import env from "../config/env";
import logger from "../config/logger";

/**
 * Rate limiters. Responses reuse the standard error envelope
 * (`{ success: false, message }`) so clients see a consistent shape.
 *
 * Skipped entirely under NODE_ENV=test so the limiter never interferes with
 * automated test runs.
 */

const sharedOptions: Partial<Options> = {
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: () => env.NODE_ENV === "test",
  handler: (req, res, _next, options) => {
    logger.warn("Rate limit exceeded", { ip: req.ip, path: req.originalUrl });
    res.status(options.statusCode).json({
      success: false,
      message: options.message as string,
    });
  },
};

/**
 * Strict limiter for authentication endpoints (login, register, refresh) to
 * blunt credential-stuffing / brute-force attempts. Keyed by client IP.
 */
export const authLimiter = rateLimit({
  ...sharedOptions,
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 20,
  statusCode: StatusCodes.TOO_MANY_REQUESTS,
  message: "Too many authentication attempts. Please try again later.",
});

/**
 * General-purpose limiter applied to the whole API surface as a safety net
 * against abusive traffic. Generous enough not to affect normal usage.
 */
export const apiLimiter = rateLimit({
  ...sharedOptions,
  windowMs: 60 * 1000, // 1 minute
  limit: 120,
  statusCode: StatusCodes.TOO_MANY_REQUESTS,
  message: "Too many requests. Please slow down.",
});
