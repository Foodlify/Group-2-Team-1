import { z } from "zod";
import { schemaRegistry } from "../../openapi/registry";
import { PaginationMetaSchema } from "../../shared/schemas/pagination.schema";

// ═══════════════════════════════════════════════════════════════
// Request Schemas (inputs)
// ═══════════════════════════════════════════════════════════════

export const CreateRatingRequestSchema = z
  .object({
    orderId: z.cuid2().meta({
      description: "The delivered order being rated",
      example: "clxyz...",
    }),
    rating: z.number().int().min(1).max(5).meta({
      description: "Stars (1–5)",
      example: 5,
    }),
    comment: z.string().min(1).max(500).optional().meta({
      description: "Optional free-text comment",
      example: "Great koshary, fast delivery",
    }),
  })
  .meta({
    id: "CreateRatingRequest",
    description: "Rate the restaurant of a delivered order",
  });

// ═══════════════════════════════════════════════════════════════
// Response Schemas (outputs)
// ═══════════════════════════════════════════════════════════════

export const RatingResponseSchema = z
  .object({
    id: z.cuid2(),
    restaurantId: z.cuid2(),
    orderId: z.cuid2(),
    customerId: z.cuid2(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().nullable(),
    customerName: z.string().optional().meta({
      description:
        "Rater display name — present on the public restaurant listing",
    }),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: "RatingResponse" });

export const RatingSuccessResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: RatingResponseSchema,
  })
  .meta({ id: "RatingSuccessResponse" });

export const RatingListSuccessResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.array(RatingResponseSchema),
  })
  .meta({ id: "RatingListSuccessResponse" });

export const RestaurantRatingsSummarySchema = z
  .object({
    averageRating: z.number().nullable().meta({
      description:
        "Average stars rounded to 1 decimal — null when the restaurant has no ratings yet",
      example: 4.3,
    }),
    ratingsCount: z.number().int().nonnegative(),
  })
  .meta({ id: "RestaurantRatingsSummary" });

export const RestaurantRatingsSuccessResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({
      summary: RestaurantRatingsSummarySchema,
      ratings: z.array(RatingResponseSchema),
    }),
    meta: PaginationMetaSchema,
  })
  .meta({ id: "RestaurantRatingsSuccessResponse" });

// ═══════════════════════════════════════════════════════════════
// Registry
// ═══════════════════════════════════════════════════════════════

schemaRegistry.register("CreateRatingRequest", CreateRatingRequestSchema);
schemaRegistry.register("RatingResponse", RatingResponseSchema);
schemaRegistry.register("RatingSuccessResponse", RatingSuccessResponseSchema);
schemaRegistry.register(
  "RatingListSuccessResponse",
  RatingListSuccessResponseSchema,
);
schemaRegistry.register(
  "RestaurantRatingsSummary",
  RestaurantRatingsSummarySchema,
);
schemaRegistry.register(
  "RestaurantRatingsSuccessResponse",
  RestaurantRatingsSuccessResponseSchema,
);

// ═══════════════════════════════════════════════════════════════
// TypeScript Types
// ═══════════════════════════════════════════════════════════════

export type CreateRatingInput = z.infer<typeof CreateRatingRequestSchema>;
export type RatingResponse = z.infer<typeof RatingResponseSchema>;
export type RestaurantRatingsSummary = z.infer<
  typeof RestaurantRatingsSummarySchema
>;
