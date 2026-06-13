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

export const CreateRestaurantRequestSchema = z
  .object({
    name: z.string().min(2).meta({ description: "Restaurant name", example: "Pizza Palace" }),
  })
  .meta({ id: "CreateRestaurantRequest", description: "Admin-created restaurant payload" });

export const UpdateRestaurantRequestSchema = z
  .object({
    name: z.string().min(2).meta({ description: "Restaurant name", example: "Pizza Palace" }),
  })
  .meta({ id: "UpdateRestaurantRequest", description: "Fields to update on a restaurant" });

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
schemaRegistry.register("CreateRestaurantRequest", CreateRestaurantRequestSchema);
schemaRegistry.register("UpdateRestaurantRequest", UpdateRestaurantRequestSchema);
schemaRegistry.register("RestaurantResponse", RestaurantResponseSchema);
schemaRegistry.register("RestaurantSuccessResponse", RestaurantSuccessResponseSchema);
schemaRegistry.register("RestaurantListSuccessResponse", RestaurantListSuccessResponseSchema);

export type RestaurantIdParams = z.infer<typeof RestaurantIdParamsSchema>;
export type RestaurantQuery = z.infer<typeof RestaurantQuerySchema>;
export type CreateRestaurantInput = z.infer<typeof CreateRestaurantRequestSchema>;
export type UpdateRestaurantInput = z.infer<typeof UpdateRestaurantRequestSchema>;
export type RestaurantResponse = z.infer<typeof RestaurantResponseSchema>;
