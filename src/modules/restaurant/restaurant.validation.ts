import { z } from "zod";
import { schemaRegistry } from "../../openapi/registry";
import {
  PaginationMetaSchema,
  PaginationQuerySchema,
} from "../../shared/schemas/pagination.schema";

export const RestaurantIdParamsSchema = z
  .object({
    restaurantId: z
      .cuid2()
      .meta({ description: "Restaurant ID", example: "clxyz..." }),
  })
  .meta({ id: "RestaurantIdParams" });

export const RestaurantQuerySchema = PaginationQuerySchema.extend({
  search: z.string().min(1).optional().meta({
    description: "Case-insensitive name search",
    example: "pizza",
  }),
  includeDeleted: z.stringbool().optional().meta({
    description:
      "Include soft-deleted restaurants. Honoured for ADMIN callers only — ignored for everyone else.",
    example: "true",
  }),
}).meta({
  id: "RestaurantQuery",
  description: "Pagination + optional name search",
});

export const RestaurantDetailsRequestSchema = z
  .object({
    phone: z
      .string()
      .min(6)
      .meta({ description: "Contact phone", example: "+201000000000" }),
    email: z.email().optional().meta({ example: "hello@pizzapalace.example" }),
    description: z.string().min(1).max(1000).optional().meta({
      example: "Wood-fired pizza, open since 1998.",
    }),
    addressLine1: z.string().min(1).meta({ example: "12 Tahrir St" }),
    addressLine2: z.string().min(1).optional().meta({ example: "Floor 2" }),
    city: z.string().min(1).meta({ example: "Cairo" }),
    postalCode: z.string().min(1).meta({ example: "11511" }),
    country: z.string().min(1).meta({ example: "Egypt" }),
  })
  .meta({
    id: "RestaurantDetailsRequest",
    description:
      "Contact and location details. Sent whole, never partially: on update this REPLACES any existing details rather than merging into them, because a partial patch nested inside a partial patch is ambiguous about required fields — is an absent `city` unchanged, or being cleared?",
  });

export const CreateRestaurantRequestSchema = z
  .object({
    name: z
      .string()
      .min(2)
      .meta({ description: "Restaurant name", example: "Pizza Palace" }),
    details: RestaurantDetailsRequestSchema.optional().meta({
      description: "Optional at registration; can be added later via PATCH",
    }),
  })
  .meta({
    id: "CreateRestaurantRequest",
    description: "Admin-created restaurant payload",
  });

export const UpdateRestaurantRequestSchema = z
  .object({
    name: z
      .string()
      .min(2)
      .optional()
      .meta({ description: "Restaurant name", example: "Pizza Palace" }),
    details: RestaurantDetailsRequestSchema.optional().meta({
      description:
        "Creates the details if there are none, replaces them if there are",
    }),
  })
  .refine((data) => data.name !== undefined || data.details !== undefined, {
    message: "Provide at least one of 'name' or 'details'",
  })
  .meta({
    id: "UpdateRestaurantRequest",
    description: "Fields to update on a restaurant",
  });

export const AssignOwnerRequestSchema = z
  .object({
    ownerId: z
      .cuid2()
      .nullable()
      .meta({
        description:
          "User id of a RESTAURANT-role account, or null to leave the " +
          "restaurant unowned and admin-run",
        example: "clxyz...",
      }),
  })
  .meta({
    id: "AssignOwnerRequest",
    description: "Assign or clear a restaurant's owner",
  });

export const RestaurantOwnerResponseSchema = z
  .object({
    restaurantId: z.cuid2(),
    ownerId: z.cuid2().nullable(),
  })
  .meta({ id: "RestaurantOwnerResponse" });

export const RestaurantOwnerSuccessResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: RestaurantOwnerResponseSchema,
  })
  .meta({ id: "RestaurantOwnerSuccessResponse" });

export const RestaurantDetailsResponseSchema = z
  .object({
    phone: z.string(),
    email: z.string().nullable(),
    description: z.string().nullable(),
    addressLine1: z.string(),
    addressLine2: z.string().nullable(),
    city: z.string(),
    postalCode: z.string(),
    country: z.string(),
  })
  .meta({ id: "RestaurantDetails" });

export const RestaurantResponseSchema = z
  .object({
    id: z.cuid2(),
    name: z.string(),
    isDeleted: z.boolean().meta({
      description:
        "Soft-delete flag. Always false on public reads — deleted restaurants are filtered out.",
      example: false,
    }),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "RestaurantResponse" });

export const RestaurantDetailedResponseSchema = RestaurantResponseSchema.extend(
  {
    details: RestaurantDetailsResponseSchema.nullable().meta({
      description: "Null for a restaurant registered without details",
    }),
  },
).meta({ id: "RestaurantDetailedResponse" });

export const RestaurantSuccessResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: RestaurantDetailedResponseSchema,
  })
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
schemaRegistry.register(
  "CreateRestaurantRequest",
  CreateRestaurantRequestSchema,
);
schemaRegistry.register(
  "UpdateRestaurantRequest",
  UpdateRestaurantRequestSchema,
);
schemaRegistry.register(
  "RestaurantDetailsRequest",
  RestaurantDetailsRequestSchema,
);
schemaRegistry.register("AssignOwnerRequest", AssignOwnerRequestSchema);
schemaRegistry.register(
  "RestaurantOwnerResponse",
  RestaurantOwnerResponseSchema,
);
schemaRegistry.register(
  "RestaurantOwnerSuccessResponse",
  RestaurantOwnerSuccessResponseSchema,
);
schemaRegistry.register("RestaurantDetails", RestaurantDetailsResponseSchema);
schemaRegistry.register("RestaurantResponse", RestaurantResponseSchema);
schemaRegistry.register(
  "RestaurantDetailedResponse",
  RestaurantDetailedResponseSchema,
);
schemaRegistry.register(
  "RestaurantSuccessResponse",
  RestaurantSuccessResponseSchema,
);
schemaRegistry.register(
  "RestaurantListSuccessResponse",
  RestaurantListSuccessResponseSchema,
);

export type RestaurantIdParams = z.infer<typeof RestaurantIdParamsSchema>;
export type RestaurantQuery = z.infer<typeof RestaurantQuerySchema>;
export type CreateRestaurantInput = z.infer<
  typeof CreateRestaurantRequestSchema
>;
export type UpdateRestaurantInput = z.infer<
  typeof UpdateRestaurantRequestSchema
>;
export type AssignOwnerInput = z.infer<typeof AssignOwnerRequestSchema>;
export type RestaurantOwnerResponse = z.infer<
  typeof RestaurantOwnerResponseSchema
>;
export type RestaurantResponse = z.infer<typeof RestaurantResponseSchema>;
export type RestaurantDetailsInput = z.infer<
  typeof RestaurantDetailsRequestSchema
>;
export type RestaurantDetailsResponse = z.infer<
  typeof RestaurantDetailsResponseSchema
>;
export type RestaurantDetailedResponse = z.infer<
  typeof RestaurantDetailedResponseSchema
>;
