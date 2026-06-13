import { z } from "zod";
import { schemaRegistry } from "../../openapi/registry";
import { MenuItemResponseSchema } from "../menuItem/menuItem.validation";

export const MenuIdParamsSchema = z
  .object({
    menuId: z.cuid2().meta({ description: "Menu ID", example: "clxyz..." }),
  })
  .meta({ id: "MenuIdParams" });

export const CreateMenuRequestSchema = z
  .object({
    name: z.string().min(2).meta({ description: "Menu name", example: "Lunch Menu" }),
    restaurantId: z.cuid2().meta({ description: "Owning restaurant ID", example: "clxyz..." }),
  })
  .meta({ id: "CreateMenuRequest", description: "Admin-created menu payload" });

export const UpdateMenuRequestSchema = z
  .object({
    name: z.string().min(2).meta({ description: "Menu name", example: "Lunch Menu" }),
  })
  .meta({ id: "UpdateMenuRequest", description: "Fields to update on a menu" });

export const MenuResponseSchema = z
  .object({
    id: z.cuid2(),
    name: z.string(),
    restaurantId: z.cuid2(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "MenuResponse" });

export const MenuWithItemsResponseSchema = MenuResponseSchema.extend({
  items: z.array(MenuItemResponseSchema),
}).meta({ id: "MenuWithItemsResponse" });

export const MenuSuccessResponseSchema = z
  .object({ success: z.literal(true), message: z.string(), data: MenuWithItemsResponseSchema })
  .meta({ id: "MenuSuccessResponse" });

export const MenuListSuccessResponseSchema = z
  .object({ success: z.literal(true), message: z.string(), data: z.array(MenuResponseSchema) })
  .meta({ id: "MenuListSuccessResponse" });

schemaRegistry.register("MenuIdParams", MenuIdParamsSchema);
schemaRegistry.register("CreateMenuRequest", CreateMenuRequestSchema);
schemaRegistry.register("UpdateMenuRequest", UpdateMenuRequestSchema);
schemaRegistry.register("MenuResponse", MenuResponseSchema);
schemaRegistry.register("MenuWithItemsResponse", MenuWithItemsResponseSchema);
schemaRegistry.register("MenuSuccessResponse", MenuSuccessResponseSchema);
schemaRegistry.register("MenuListSuccessResponse", MenuListSuccessResponseSchema);

export type MenuIdParams = z.infer<typeof MenuIdParamsSchema>;
export type CreateMenuInput = z.infer<typeof CreateMenuRequestSchema>;
export type UpdateMenuInput = z.infer<typeof UpdateMenuRequestSchema>;
export type MenuResponse = z.infer<typeof MenuResponseSchema>;
export type MenuWithItemsResponse = z.infer<typeof MenuWithItemsResponseSchema>;
