import { z } from "zod";
import { schemaRegistry } from "../../openapi/registry";

export const MenuItemIdParamsSchema = z
  .object({
    menuItemId: z.cuid2().meta({ description: "Menu item ID", example: "clxyz..." }),
  })
  .meta({ id: "MenuItemIdParams" });

export const CreateMenuItemRequestSchema = z
  .object({
    menuId: z.cuid2().meta({ description: "Owning menu ID", example: "clxyz..." }),
    name: z.string().min(2).meta({ description: "Item name", example: "Margherita Pizza" }),
    price: z.number().positive().meta({ description: "Unit price", example: 12.99 }),
  })
  .meta({ id: "CreateMenuItemRequest", description: "Admin-created menu item payload" });

export const UpdateMenuItemRequestSchema = z
  .object({
    name: z.string().min(2).optional().meta({ description: "Item name", example: "Margherita Pizza" }),
    price: z.number().positive().optional().meta({ description: "Unit price", example: 12.99 }),
  })
  .meta({ id: "UpdateMenuItemRequest", description: "Fields to update on a menu item" });

export const MenuItemResponseSchema = z
  .object({
    id: z.cuid2(),
    menuId: z.cuid2(),
    name: z.string(),
    price: z.number().meta({ description: "Unit price", example: 12.99 }),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "MenuItemResponse" });

export const MenuItemSuccessResponseSchema = z
  .object({ success: z.literal(true), message: z.string(), data: MenuItemResponseSchema })
  .meta({ id: "MenuItemSuccessResponse" });

export const MenuItemListSuccessResponseSchema = z
  .object({ success: z.literal(true), message: z.string(), data: z.array(MenuItemResponseSchema) })
  .meta({ id: "MenuItemListSuccessResponse" });

schemaRegistry.register("MenuItemIdParams", MenuItemIdParamsSchema);
schemaRegistry.register("CreateMenuItemRequest", CreateMenuItemRequestSchema);
schemaRegistry.register("UpdateMenuItemRequest", UpdateMenuItemRequestSchema);
schemaRegistry.register("MenuItemResponse", MenuItemResponseSchema);
schemaRegistry.register("MenuItemSuccessResponse", MenuItemSuccessResponseSchema);
schemaRegistry.register("MenuItemListSuccessResponse", MenuItemListSuccessResponseSchema);

export type MenuItemIdParams = z.infer<typeof MenuItemIdParamsSchema>;
export type CreateMenuItemInput = z.infer<typeof CreateMenuItemRequestSchema>;
export type UpdateMenuItemInput = z.infer<typeof UpdateMenuItemRequestSchema>;
export type MenuItemResponse = z.infer<typeof MenuItemResponseSchema>;
