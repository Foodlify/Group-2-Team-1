import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodType } from "zod";

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
        // `req.query` is read-only on Express 5; mutate its properties instead of reassigning
        Object.assign(req.query as object, parsedQuery);
      }
      if (schemas.params) {
        const parsedParams = await schemas.params.parseAsync(req.params);
        Object.assign(req.params as object, parsedParams);
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
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