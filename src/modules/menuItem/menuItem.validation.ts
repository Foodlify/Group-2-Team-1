import { z } from "zod";
import { schemaRegistry } from "../../openapi/registry";

export const MenuItemIdParamsSchema = z
  .object({
    menuItemId: z.cuid2().meta({ description: "Menu item ID", example: "clxyz..." }),
  })
  .meta({ id: "MenuItemIdParams" });

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
schemaRegistry.register("MenuItemResponse", MenuItemResponseSchema);
schemaRegistry.register("MenuItemSuccessResponse", MenuItemSuccessResponseSchema);
schemaRegistry.register("MenuItemListSuccessResponse", MenuItemListSuccessResponseSchema);

export type MenuItemIdParams = z.infer<typeof MenuItemIdParamsSchema>;
export type MenuItemResponse = z.infer<typeof MenuItemResponseSchema>;
