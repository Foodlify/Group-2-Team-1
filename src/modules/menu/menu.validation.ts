import { z } from "zod";
import { schemaRegistry } from "../../openapi/registry";
import {
  PaginationMetaSchema,
  PaginationQuerySchema,
} from "../../shared/schemas/pagination.schema";
import { MenuItemResponseSchema } from "../menuItem/menuItem.validation";
import { MENU_CHANGE_ACTIONS, MENU_CHANGE_ENTITIES } from "./menu.model";

export const MenuIdParamsSchema = z
  .object({
    menuId: z.cuid2().meta({ description: "Menu ID", example: "clxyz..." }),
  })
  .meta({ id: "MenuIdParams" });

export const CreateMenuRequestSchema = z
  .object({
    name: z
      .string()
      .min(2)
      .meta({ description: "Menu name", example: "Lunch Menu" }),
    restaurantId: z
      .cuid2()
      .meta({ description: "Owning restaurant ID", example: "clxyz..." }),
  })
  .meta({ id: "CreateMenuRequest", description: "Admin-created menu payload" });

export const UpdateMenuRequestSchema = z
  .object({
    name: z
      .string()
      .min(2)
      .meta({ description: "Menu name", example: "Lunch Menu" }),
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
  .object({
    success: z.literal(true),
    message: z.string(),
    data: MenuWithItemsResponseSchema,
  })
  .meta({ id: "MenuSuccessResponse" });

export const MenuListSuccessResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.array(MenuResponseSchema),
  })
  .meta({ id: "MenuListSuccessResponse" });

// ─── Menu history (official "View History List of Menu") ─

export const MenuHistoryQuerySchema = PaginationQuerySchema.meta({
  id: "MenuHistoryQuery",
});

export const MenuChangeLogResponseSchema = z
  .object({
    id: z.cuid2(),
    entity: z.enum(MENU_CHANGE_ENTITIES),
    entityId: z.cuid2(),
    action: z.enum(MENU_CHANGE_ACTIONS),
    snapshot: z.record(z.string(), z.unknown()).meta({
      description:
        "Row state after the change (for deletes: the last state before removal)",
    }),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: "MenuChangeLogResponse" });

export const MenuHistorySuccessResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.array(MenuChangeLogResponseSchema),
    meta: PaginationMetaSchema,
  })
  .meta({ id: "MenuHistorySuccessResponse" });

schemaRegistry.register("MenuIdParams", MenuIdParamsSchema);
schemaRegistry.register("CreateMenuRequest", CreateMenuRequestSchema);
schemaRegistry.register("UpdateMenuRequest", UpdateMenuRequestSchema);
schemaRegistry.register("MenuResponse", MenuResponseSchema);
schemaRegistry.register("MenuWithItemsResponse", MenuWithItemsResponseSchema);
schemaRegistry.register("MenuSuccessResponse", MenuSuccessResponseSchema);
schemaRegistry.register(
  "MenuListSuccessResponse",
  MenuListSuccessResponseSchema,
);
schemaRegistry.register("MenuHistoryQuery", MenuHistoryQuerySchema);
schemaRegistry.register("MenuChangeLogResponse", MenuChangeLogResponseSchema);
schemaRegistry.register(
  "MenuHistorySuccessResponse",
  MenuHistorySuccessResponseSchema,
);

export type MenuIdParams = z.infer<typeof MenuIdParamsSchema>;
export type CreateMenuInput = z.infer<typeof CreateMenuRequestSchema>;
export type UpdateMenuInput = z.infer<typeof UpdateMenuRequestSchema>;
export type MenuResponse = z.infer<typeof MenuResponseSchema>;
export type MenuWithItemsResponse = z.infer<typeof MenuWithItemsResponseSchema>;
export type MenuHistoryQuery = z.infer<typeof MenuHistoryQuerySchema>;
export type MenuChangeLogResponse = z.infer<typeof MenuChangeLogResponseSchema>;
