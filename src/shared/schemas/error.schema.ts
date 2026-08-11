import { z } from "zod";
import { schemaRegistry } from "../../openapi/registry";

export const ErrorResponseSchema = z
  .object({
    success: z.literal(false).meta({
      description: "Always false for error responses",
      example: false,
    }),
    message: z.string().meta({
      description: "Human-readable error message",
      example: "Resource not found",
    }),
  })
  .meta({
    id: "ErrorResponse",
    description: "Standard error response",
  });

export const ValidationErrorResponseSchema = z
  .object({
    success: z.literal(false),
    message: z.literal("Validation failed"),
    errors: z.array(
      z.object({
        path: z.string().meta({
          description: "Dot-notation path to the invalid field",
          example: "body.email",
        }),
        message: z.string().meta({
          description: "Validation error message",
          example: "Invalid email format",
        }),
      }),
    ),
  })
  .meta({
    id: "ValidationErrorResponse",
    description: "Validation error with per-field details",
  });

schemaRegistry.register("ErrorResponse", ErrorResponseSchema);
schemaRegistry.register(
  "ValidationErrorResponse",
  ValidationErrorResponseSchema,
);

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type ValidationErrorResponse = z.infer<
  typeof ValidationErrorResponseSchema
>;
