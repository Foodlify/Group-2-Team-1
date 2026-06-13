import type { Router } from "express";
import { defineRoutes } from "../../openapi/route-builder";
import {
  ErrorResponseSchema,
  ValidationErrorResponseSchema,
} from "../../shared/schemas/error.schema";
import { MenuItemListSuccessResponseSchema } from "../menuItem/menuItem.validation";
import * as controller from "./menu.controller";
import {
  CreateMenuRequestSchema,
  MenuIdParamsSchema,
  MenuSuccessResponseSchema,
  UpdateMenuRequestSchema,
} from "./menu.validation";

const router: Router = defineRoutes({
  basePath: "/api/v1/menus",
  tag: "Catalog",
  routes: [
    {
      method: "get",
      path: "/:menuId",
      summary: "Get a menu with its items",
      request: { params: MenuIdParamsSchema },
      responses: {
        200: { description: "Menu", schema: MenuSuccessResponseSchema },
        404: { description: "Menu not found", schema: ErrorResponseSchema },
      },
      handler: controller.getMenu,
    },
    {
      method: "get",
      path: "/:menuId/items",
      summary: "List items of a menu",
      request: { params: MenuIdParamsSchema },
      responses: {
        200: { description: "Items", schema: MenuItemListSuccessResponseSchema },
        404: { description: "Menu not found", schema: ErrorResponseSchema },
      },
      handler: controller.getMenuItems,
    },
    {
      method: "post",
      path: "/",
      auth: ["ADMIN"],
      summary: "Create a menu (ADMIN)",
      request: { body: CreateMenuRequestSchema },
      responses: {
        201: { description: "Created", schema: MenuSuccessResponseSchema },
        400: { description: "Validation failed", schema: ValidationErrorResponseSchema },
        403: { description: "Forbidden", schema: ErrorResponseSchema },
        404: { description: "Restaurant not found", schema: ErrorResponseSchema },
      },
      handler: controller.createMenu,
    },
    {
      method: "patch",
      path: "/:menuId",
      auth: ["ADMIN"],
      summary: "Update a menu (ADMIN)",
      request: { params: MenuIdParamsSchema, body: UpdateMenuRequestSchema },
      responses: {
        200: { description: "Updated", schema: MenuSuccessResponseSchema },
        403: { description: "Forbidden", schema: ErrorResponseSchema },
        404: { description: "Menu not found", schema: ErrorResponseSchema },
      },
      handler: controller.updateMenu,
    },
    {
      method: "delete",
      path: "/:menuId",
      auth: ["ADMIN"],
      summary: "Delete a menu (ADMIN)",
      request: { params: MenuIdParamsSchema },
      responses: {
        200: { description: "Deleted" },
        403: { description: "Forbidden", schema: ErrorResponseSchema },
        404: { description: "Menu not found", schema: ErrorResponseSchema },
        409: { description: "Menu items referenced by existing carts or orders", schema: ErrorResponseSchema },
      },
      handler: controller.deleteMenu,
    },
  ],
});

export default router;
