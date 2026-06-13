import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodType } from "zod";
import { StatusCodes } from "http-status-codes";

interface ValidationSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

/**
 * Express middleware factory that validates `req.body`, `req.query`, and/or `req.params`
 * against Zod schemas. On success, the parsed (and optionally transformed) values
 * replace the originals on `req`. On failure, responds with 400 and per-field errors.
 *
 * Usage:
 *   router.post("/users", validate({ body: CreateUserSchema }), handler);
 */
export const validate =
  (schemas: ValidationSchemas) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (schemas.body) {
        req.body = await schemas.body.parseAsync(req.body);
      }
      if (schemas.query) {
        const parsedQuery = await schemas.query.parseAsync(req.query);
        // In Express 5 `req.query` is a getter that re-parses the URL on every
        // access, so mutating it doesn't persist. Redefine it as a static value
        // so the validated/coerced query reaches the controller.
        Object.defineProperty(req, "query", {
          value: parsedQuery,
          writable: true,
          configurable: true,
        });
      }
      if (schemas.params) {
        const parsedParams = await schemas.params.parseAsync(req.params);
        Object.assign(req.params as object, parsedParams);
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: "Validation failed",
          errors: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        });
        return;
      }
      next(error);
    }
  };