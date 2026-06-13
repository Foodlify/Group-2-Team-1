import { Router } from "express";
import { validate } from "../../middlewares/validate.middleware";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { routeRegistry } from "../../openapi/registry";
import * as controller from "./menuItem.controller";
import {
  CreateMenuItemRequestSchema,
  MenuItemIdParamsSchema,
  UpdateMenuItemRequestSchema,
} from "./menuItem.validation";

const router: Router = Router();

// ─── Public catalog reads ────────────────────────────────
router.get(
  "/:menuItemId",
  validate({ params: MenuItemIdParamsSchema }),
  controller.getMenuItem,
);

// ─── Admin management (ADMIN only) ───────────────────────
router.post(
  "/",
  authenticate,
  authorize("ADMIN"),
  validate({ body: CreateMenuItemRequestSchema }),
  controller.createMenuItem,
);
router.patch(
  "/:menuItemId",
  authenticate,
  authorize("ADMIN"),
  validate({ params: MenuItemIdParamsSchema, body: UpdateMenuItemRequestSchema }),
  controller.updateMenuItem,
);
router.delete(
  "/:menuItemId",
  authenticate,
  authorize("ADMIN"),
  validate({ params: MenuItemIdParamsSchema }),
  controller.deleteMenuItem,
);

// ─── OpenAPI ─────────────────────────────────────────────
const tag = "Catalog";
const errorRef = { $ref: "#/components/schemas/ErrorResponse" };
const validationErrorRef = { $ref: "#/components/schemas/ValidationErrorResponse" };
const menuItemIdParam = { name: "menuItemId", in: "path", required: true, schema: { type: "string" as const } } as const;
const security: Record<string, string[]>[] = [{ cookieAuth: [] }, { BearerAuth: [] }];
const jsonBody = (ref: string) => ({
  required: true,
  content: { "application/json": { schema: { $ref: `#/components/schemas/${ref}` } } },
});

routeRegistry.push({
  path: "/api/v1/menu-items/{menuItemId}",
  pathItem: {
    get: {
      tags: [tag],
      summary: "Get a menu item by ID",
      parameters: [menuItemIdParam],
      responses: {
        "200": {
          description: "Menu item",
          content: { "application/json": { schema: { $ref: "#/components/schemas/MenuItemSuccessResponse" } } },
        },
        "404": {
          description: "Menu item not found",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
    patch: {
      tags: [tag],
      summary: "Update a menu item (ADMIN)",
      security,
      parameters: [menuItemIdParam],
      requestBody: jsonBody("UpdateMenuItemRequest"),
      responses: {
        "200": { description: "Updated", content: { "application/json": { schema: { $ref: "#/components/schemas/MenuItemSuccessResponse" } } } },
        "403": { description: "Forbidden", content: { "application/json": { schema: errorRef } } },
        "404": { description: "Menu item not found", content: { "application/json": { schema: errorRef } } },
      },
    },
    delete: {
      tags: [tag],
      summary: "Delete a menu item (ADMIN)",
      security,
      parameters: [menuItemIdParam],
      responses: {
        "200": { description: "Deleted" },
        "403": { description: "Forbidden", content: { "application/json": { schema: errorRef } } },
        "404": { description: "Menu item not found", content: { "application/json": { schema: errorRef } } },
        "409": { description: "Referenced by existing carts or orders", content: { "application/json": { schema: errorRef } } },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/menu-items",
  pathItem: {
    post: {
      tags: [tag],
      summary: "Create a menu item (ADMIN)",
      security,
      requestBody: jsonBody("CreateMenuItemRequest"),
      responses: {
        "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/MenuItemSuccessResponse" } } } },
        "400": { description: "Validation failed", content: { "application/json": { schema: validationErrorRef } } },
        "403": { description: "Forbidden", content: { "application/json": { schema: errorRef } } },
        "404": { description: "Menu not found", content: { "application/json": { schema: errorRef } } },
      },
    },
  },
});

export default router;
