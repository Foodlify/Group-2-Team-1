import { z } from "zod";
import { schemaRegistry } from "../../openapi/registry";

/**
 * Query parameters for paginated list endpoints.
 * `z.coerce.number()` converts query string values (which are always strings) to numbers.
 */
export const PaginationQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1).meta({
      description: "Page number (1-indexed)",
      example: 1,
    }),
    limit: z.coerce.number().int().min(1).max(100).default(20).meta({
      description: "Number of items per page (max 100)",
      example: 20,
    }),
  })
  .meta({
    id: "PaginationQuery",
    description: "Pagination query parameters",
  });

/**
 * Metadata returned in paginated responses.
 */
export const PaginationMetaSchema = z
  .object({
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    total: z.number().int().nonnegative().meta({
      description: "Total number of items across all pages",
    }),
    totalPages: z.number().int().nonnegative(),
  })
  .meta({
    id: "PaginationMeta",
    description: "Pagination metadata",
  });

/**
 * Helper to build a paginated response schema for a given item type.
 * Usage: `PaginatedResponseSchema(UserSchema)` → `{ data: User[], meta: PaginationMeta }`
 */
export const PaginatedResponseSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    success: z.literal(true),
    data: z.array(itemSchema),
    meta: PaginationMetaSchema,
  });

// Register with OpenAPI components
schemaRegistry.register("PaginationQuery", PaginationQuerySchema);
schemaRegistry.register("PaginationMeta", PaginationMetaSchema);

// TypeScript types
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;
