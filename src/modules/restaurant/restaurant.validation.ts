import { z } from "zod";
import { schemaRegistry } from "../../openapi/registry";
import {
  PaginationMetaSchema,
  PaginationQuerySchema,
} from "../../shared/schemas/pagination.schema";

export const RestaurantIdParamsSchema = z
  .object({
    restaurantId: z.cuid2().meta({ description: "Restaurant ID", example: "clxyz..." }),
  })
  .meta({ id: "RestaurantIdParams" });

export const RestaurantQuerySchema = PaginationQuerySchema.extend({
  search: z.string().min(1).optional().meta({
    description: "Case-insensitive name search",
    example: "pizza",
  }),
}).meta({ id: "RestaurantQuery", description: "Pagination + optional name search" });

export const RestaurantResponseSchema = z
  .object({
    id: z.cuid2(),
    name: z.string(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "RestaurantResponse" });

export const RestaurantSuccessResponseSchema = z
  .object({ success: z.literal(true), message: z.string(), data: RestaurantResponseSchema })
  .meta({ id: "RestaurantSuccessResponse" });

export const RestaurantListSuccessResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.array(RestaurantResponseSchema),
    meta: PaginationMetaSchema,
  })
  .meta({ id: "RestaurantListSuccessResponse" });

schemaRegistry.register("RestaurantIdParams", RestaurantIdParamsSchema);
schemaRegistry.register("RestaurantQuery", RestaurantQuerySchema);
schemaRegistry.register("RestaurantResponse", RestaurantResponseSchema);
schemaRegistry.register("RestaurantSuccessResponse", RestaurantSuccessResponseSchema);
schemaRegistry.register("RestaurantListSuccessResponse", RestaurantListSuccessResponseSchema);

export type RestaurantIdParams = z.infer<typeof RestaurantIdParamsSchema>;
export type RestaurantQuery = z.infer<typeof RestaurantQuerySchema>;
export type RestaurantResponse = z.infer<typeof RestaurantResponseSchema>;
