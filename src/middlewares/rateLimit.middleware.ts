import rateLimit, { type Options } from "express-rate-limit";
import { StatusCodes } from "http-status-codes";
import env from "../config/env";
import logger from "../config/logger";

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

export const authLimiter = rateLimit({
  ...sharedOptions,
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 20,
  statusCode: StatusCodes.TOO_MANY_REQUESTS,
  message: "Too many authentication attempts. Please try again later.",
});

export const apiLimiter = rateLimit({
  ...sharedOptions,
  windowMs: 60 * 1000, // 1 minute
  limit: 120,
  statusCode: StatusCodes.TOO_MANY_REQUESTS,
  message: "Too many requests. Please slow down.",
});
