import type { Router } from "express";
import { defineRoutes } from "../../openapi/route-builder";
import {
  ErrorResponseSchema,
  ValidationErrorResponseSchema,
} from "../../shared/schemas/error.schema";
import * as controller from "./menuItem.controller";
import {
  CreateMenuItemRequestSchema,
  MenuItemIdParamsSchema,
  MenuItemSuccessResponseSchema,
  UpdateMenuItemRequestSchema,
} from "./menuItem.validation";

const router: Router = defineRoutes({
  basePath: "/api/v1/menu-items",
  tag: "Catalog",
  routes: [
    {
      method: "get",
      path: "/:menuItemId",
      summary: "Get a menu item by ID",
      request: { params: MenuItemIdParamsSchema },
      responses: {
        200: { description: "Menu item", schema: MenuItemSuccessResponseSchema },
        404: { description: "Menu item not found", schema: ErrorResponseSchema },
      },
      handler: controller.getMenuItem,
    },
    {
      method: "post",
      path: "/",
      auth: ["ADMIN"],
      summary: "Create a menu item (ADMIN)",
      request: { body: CreateMenuItemRequestSchema },
      responses: {
        201: { description: "Created", schema: MenuItemSuccessResponseSchema },
        400: { description: "Validation failed", schema: ValidationErrorResponseSchema },
        403: { description: "Forbidden", schema: ErrorResponseSchema },
        404: { description: "Menu not found", schema: ErrorResponseSchema },
      },
      handler: controller.createMenuItem,
    },
    {
      method: "patch",
      path: "/:menuItemId",
      auth: ["ADMIN"],
      summary: "Update a menu item (ADMIN)",
      request: { params: MenuItemIdParamsSchema, body: UpdateMenuItemRequestSchema },
      responses: {
        200: { description: "Updated", schema: MenuItemSuccessResponseSchema },
        403: { description: "Forbidden", schema: ErrorResponseSchema },
        404: { description: "Menu item not found", schema: ErrorResponseSchema },
      },
      handler: controller.updateMenuItem,
    },
    {
      method: "delete",
      path: "/:menuItemId",
      auth: ["ADMIN"],
      summary: "Delete a menu item (ADMIN)",
      request: { params: MenuItemIdParamsSchema },
      responses: {
        200: { description: "Deleted" },
        403: { description: "Forbidden", schema: ErrorResponseSchema },
        404: { description: "Menu item not found", schema: ErrorResponseSchema },
        409: { description: "Referenced by existing carts or orders", schema: ErrorResponseSchema },
      },
      handler: controller.deleteMenuItem,
    },
  ],
});

export default router;
