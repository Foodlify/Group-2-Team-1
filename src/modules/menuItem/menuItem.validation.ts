import { z } from "zod";
import { schemaRegistry } from "../../openapi/registry";
import {
  PaginationMetaSchema,
  PaginationQuerySchema,
} from "../../shared/schemas/pagination.schema";

export const MenuItemIdParamsSchema = z
  .object({
    menuItemId: z
      .cuid2()
      .meta({ description: "Menu item ID", example: "clxyz..." }),
  })
  .meta({ id: "MenuItemIdParams" });

export const CreateMenuItemRequestSchema = z
  .object({
    menuId: z
      .cuid2()
      .meta({ description: "Owning menu ID", example: "clxyz..." }),
    name: z
      .string()
      .min(2)
      .meta({ description: "Item name", example: "Margherita Pizza" }),
    price: z
      .number()
      .positive()
      .meta({ description: "Unit price", example: 12.99 }),
    stock: z.number().int().nonnegative().nullable().optional().meta({
      description:
        "Units available. Omit or send null to leave the item untracked (always orderable).",
      example: 50,
    }),
  })
  .meta({
    id: "CreateMenuItemRequest",
    description: "Admin-created menu item payload",
  });

export const UpdateMenuItemRequestSchema = z
  .object({
    name: z
      .string()
      .min(2)
      .optional()
      .meta({ description: "Item name", example: "Margherita Pizza" }),
    price: z
      .number()
      .positive()
      .optional()
      .meta({ description: "Unit price", example: 12.99 }),
    stock: z.number().int().nonnegative().nullable().optional().meta({
      description: "Units available — null switches the item back to untracked",
      example: 50,
    }),
  })
  .meta({
    id: "UpdateMenuItemRequest",
    description: "Fields to update on a menu item",
  });

export const MenuItemResponseSchema = z
  .object({
    id: z.cuid2(),
    menuId: z.cuid2(),
    name: z.string(),
    price: z.number().meta({ description: "Unit price", example: 12.99 }),
    stock: z.number().int().nullable().meta({
      description: "Units available — null when the item isn't stock-tracked",
      example: 50,
    }),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "MenuItemResponse" });

export const MenuItemSuccessResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: MenuItemResponseSchema,
  })
  .meta({ id: "MenuItemSuccessResponse" });

export const MenuItemListSuccessResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.array(MenuItemResponseSchema),
  })
  .meta({ id: "MenuItemListSuccessResponse" });

// ─── Catalog-wide search (official "Search Menu Items") ──

export const MenuItemSearchQuerySchema = PaginationQuerySchema.extend({
  search: z.string().min(1).optional().meta({
    description: "Case-insensitive item-name search",
    example: "pizza",
  }),
}).meta({
  id: "MenuItemSearchQuery",
  description: "Pagination + optional name search",
});

export const MenuItemSearchResultSchema = z
  .object({
    id: z.cuid2(),
    name: z.string(),
    price: z.number().meta({ description: "Unit price", example: 12.99 }),
    stock: z.number().int().nullable().meta({
      description: "Units available — null when the item isn't stock-tracked",
    }),
    menu: z.object({ id: z.cuid2(), name: z.string() }),
    restaurant: z.object({ id: z.cuid2(), name: z.string() }),
  })
  .meta({
    id: "MenuItemSearchResult",
    description: "A menu item with its owning menu + restaurant context",
  });

export const MenuItemSearchSuccessResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.array(MenuItemSearchResultSchema),
    meta: PaginationMetaSchema,
  })
  .meta({ id: "MenuItemSearchSuccessResponse" });

schemaRegistry.register("MenuItemIdParams", MenuItemIdParamsSchema);
schemaRegistry.register("CreateMenuItemRequest", CreateMenuItemRequestSchema);
schemaRegistry.register("UpdateMenuItemRequest", UpdateMenuItemRequestSchema);
schemaRegistry.register("MenuItemResponse", MenuItemResponseSchema);
schemaRegistry.register(
  "MenuItemSuccessResponse",
  MenuItemSuccessResponseSchema,
);
schemaRegistry.register(
  "MenuItemListSuccessResponse",
  MenuItemListSuccessResponseSchema,
);
schemaRegistry.register("MenuItemSearchQuery", MenuItemSearchQuerySchema);
schemaRegistry.register("MenuItemSearchResult", MenuItemSearchResultSchema);
schemaRegistry.register(
  "MenuItemSearchSuccessResponse",
  MenuItemSearchSuccessResponseSchema,
);

export type MenuItemIdParams = z.infer<typeof MenuItemIdParamsSchema>;
export type CreateMenuItemInput = z.infer<typeof CreateMenuItemRequestSchema>;
export type UpdateMenuItemInput = z.infer<typeof UpdateMenuItemRequestSchema>;
export type MenuItemResponse = z.infer<typeof MenuItemResponseSchema>;
export type MenuItemSearchQuery = z.infer<typeof MenuItemSearchQuerySchema>;
export type MenuItemSearchResult = z.infer<typeof MenuItemSearchResultSchema>;
