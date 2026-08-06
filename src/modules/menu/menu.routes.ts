import { Router } from "express";
import { validate } from "../../middlewares/validate.middleware";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { routeRegistry } from "../../openapi/registry";
import * as controller from "./menu.controller";
import {
  CreateMenuRequestSchema,
  MenuHistoryQuerySchema,
  MenuIdParamsSchema,
  UpdateMenuRequestSchema,
} from "./menu.validation";

const router: Router = Router();

// ─── Public catalog reads ────────────────────────────────
router.get(
  "/:menuId",
  validate({ params: MenuIdParamsSchema }),
  controller.getMenu,
);
router.get(
  "/:menuId/items",
  validate({ params: MenuIdParamsSchema }),
  controller.getMenuItems,
);

// ─── Admin management (ADMIN only) ───────────────────────
router.post(
  "/",
  authenticate,
  authorize("ADMIN"),
  validate({ body: CreateMenuRequestSchema }),
  controller.createMenu,
);
router.patch(
  "/:menuId",
  authenticate,
  authorize("ADMIN"),
  validate({ params: MenuIdParamsSchema, body: UpdateMenuRequestSchema }),
  controller.updateMenu,
);
router.delete(
  "/:menuId",
  authenticate,
  authorize("ADMIN"),
  validate({ params: MenuIdParamsSchema }),
  controller.deleteMenu,
);
router.get(
  "/:menuId/history",
  authenticate,
  authorize("ADMIN"),
  validate({ params: MenuIdParamsSchema, query: MenuHistoryQuerySchema }),
  controller.getMenuHistory,
);

// ─── OpenAPI ─────────────────────────────────────────────
const tag = "Catalog";
const errorRef = { $ref: "#/components/schemas/ErrorResponse" };
const validationErrorRef = {
  $ref: "#/components/schemas/ValidationErrorResponse",
};
const menuIdParam = {
  name: "menuId",
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
  path: "/api/v1/menus/{menuId}",
  pathItem: {
    get: {
      tags: [tag],
      summary: "Get a menu with its items",
      parameters: [menuIdParam],
      responses: {
        "200": {
          description: "Menu",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/MenuSuccessResponse" },
            },
          },
        },
        "404": {
          description: "Menu not found",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/menus/{menuId}/items",
  pathItem: {
    get: {
      tags: [tag],
      summary: "List items of a menu",
      parameters: [menuIdParam],
      responses: {
        "200": {
          description: "Items",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/MenuItemListSuccessResponse",
              },
            },
          },
        },
        "404": {
          description: "Menu not found",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});

// ─── Admin management docs ───────────────────────────────
routeRegistry.push({
  path: "/api/v1/menus",
  pathItem: {
    post: {
      tags: [tag],
      summary: "Create a menu (ADMIN)",
      security,
      requestBody: jsonBody("CreateMenuRequest"),
      responses: {
        "201": {
          description: "Created",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/MenuSuccessResponse" },
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
          description: "Restaurant not found",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/menus/{menuId}",
  pathItem: {
    patch: {
      tags: [tag],
      summary: "Update a menu (ADMIN)",
      security,
      parameters: [menuIdParam],
      requestBody: jsonBody("UpdateMenuRequest"),
      responses: {
        "200": {
          description: "Updated",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/MenuSuccessResponse" },
            },
          },
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
    delete: {
      tags: [tag],
      summary: "Delete a menu (ADMIN)",
      security,
      parameters: [menuIdParam],
      responses: {
        "200": { description: "Deleted" },
        "403": {
          description: "Forbidden",
          content: { "application/json": { schema: errorRef } },
        },
        "404": {
          description: "Menu not found",
          content: { "application/json": { schema: errorRef } },
        },
        "409": {
          description: "Menu items referenced by existing carts or orders",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/menus/{menuId}/history",
  pathItem: {
    get: {
      tags: [tag],
      summary: "View history list of a menu (ADMIN)",
      description:
        "Append-only audit of the menu and its items — every create/update/delete with a snapshot of the row state, newest first.",
      security,
      parameters: [
        menuIdParam,
        { name: "page", in: "query", schema: { type: "integer", default: 1 } },
        {
          name: "limit",
          in: "query",
          schema: { type: "integer", default: 20 },
        },
      ],
      responses: {
        "200": {
          description: "History entries",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/MenuHistorySuccessResponse",
              },
            },
          },
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
