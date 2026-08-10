import { z } from "zod";
import { schemaRegistry } from "../../openapi/registry";

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

export const PaginatedResponseSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    success: z.literal(true),
    data: z.array(itemSchema),
    meta: PaginationMetaSchema,
  });

schemaRegistry.register("PaginationQuery", PaginationQuerySchema);
schemaRegistry.register("PaginationMeta", PaginationMetaSchema);

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;
