import { Router } from "express";
import { validate } from "../../middlewares/validate.middleware";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { routeRegistry } from "../../openapi/registry";
import * as controller from "./menuItem.controller";
import {
  CreateMenuItemRequestSchema,
  MenuItemIdParamsSchema,
  MenuItemSearchQuerySchema,
  UpdateMenuItemRequestSchema,
} from "./menuItem.validation";

const router: Router = Router();

// ─── Public catalog reads ────────────────────────────────
router.get(
  "/",
  validate({ query: MenuItemSearchQuerySchema }),
  controller.searchMenuItems,
);
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
  validate({
    params: MenuItemIdParamsSchema,
    body: UpdateMenuItemRequestSchema,
  }),
  controller.updateMenuItem,
);
router.delete(
  "/:menuItemId",
  authenticate,
  authorize("ADMIN"),
  validate({ params: MenuItemIdParamsSchema }),
  controller.deleteMenuItem,
);
router.patch(
  "/:menuItemId/restore",
  authenticate,
  authorize("ADMIN"),
  validate({ params: MenuItemIdParamsSchema }),
  controller.restoreMenuItem,
);

// ─── OpenAPI ─────────────────────────────────────────────
const tag = "Catalog";
const errorRef = { $ref: "#/components/schemas/ErrorResponse" };
const validationErrorRef = {
  $ref: "#/components/schemas/ValidationErrorResponse",
};
const menuItemIdParam = {
  name: "menuItemId",
  in: "path",
  required: true,
  schema: { type: "string" as const },
} as const;
const security: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { BearerAuth: [] },
];
const jsonBody = (ref: string) => ({
  required: true,
  content: {
    "application/json": { schema: { $ref: `#/components/schemas/${ref}` } },
  },
});

routeRegistry.push({
  path: "/api/v1/menu-items",
  pathItem: {
    get: {
      tags: [tag],
      summary: "Search menu items (paginated, with menu + restaurant context)",
      parameters: [
        { name: "page", in: "query", schema: { type: "integer", default: 1 } },
        {
          name: "limit",
          in: "query",
          schema: { type: "integer", default: 20 },
        },
        {
          name: "search",
          in: "query",
          schema: { type: "string" },
          description: "Case-insensitive item-name search",
        },
      ],
      responses: {
        "200": {
          description: "Matching menu items",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/MenuItemSearchSuccessResponse",
              },
            },
          },
        },
      },
    },
  },
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
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/MenuItemSuccessResponse" },
            },
          },
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
        "200": {
          description: "Updated",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/MenuItemSuccessResponse" },
            },
          },
        },
        "403": {
          description: "Forbidden",
          content: { "application/json": { schema: errorRef } },
        },
        "404": {
          description: "Menu item not found",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
    delete: {
      tags: [tag],
      summary: "Delete a menu item (ADMIN)",
      description:
        "Soft delete — the item leaves the menu, the search and the checkout, but stays on past orders. This used to be impossible for any item that had ever been ordered.",
      security,
      parameters: [menuItemIdParam],
      responses: {
        "200": { description: "Deleted" },
        "403": {
          description: "Forbidden",
          content: { "application/json": { schema: errorRef } },
        },
        "404": {
          description: "Menu item not found",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/menu-items/{menuItemId}/restore",
  pathItem: {
    patch: {
      tags: [tag],
      summary: "Restore a soft-deleted menu item (ADMIN)",
      description:
        "Undoes a delete. Find the id with `GET /menus/{menuId}/items?includeDeleted=true` or in the menu history. Fails if the owning menu is itself deleted — restore that first.",
      security,
      parameters: [menuItemIdParam],
      responses: {
        "200": {
          description: "Restored",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/MenuItemSuccessResponse" },
            },
          },
        },
        "403": {
          description: "Forbidden",
          content: { "application/json": { schema: errorRef } },
        },
        "404": {
          description: "Menu item not found",
          content: { "application/json": { schema: errorRef } },
        },
        "409": {
          description: "Item is not deleted, or its menu still is",
          content: { "application/json": { schema: errorRef } },
        },
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
        "201": {
          description: "Created",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/MenuItemSuccessResponse" },
            },
          },
        },
        "400": {
          description: "Validation failed",
          content: { "application/json": { schema: validationErrorRef } },
        },
        "403": {
          description: "Forbidden",
          content: { "application/json": { schema: errorRef } },
        },
        "404": {
          description: "Menu not found",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});

export default router;
