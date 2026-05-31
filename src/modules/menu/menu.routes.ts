import { Router } from "express";
import { validate } from "../../middlewares/validate.middleware";
import { routeRegistry } from "../../openapi/registry";
import * as controller from "./menu.controller";
import { MenuIdParamsSchema } from "./menu.validation";

const router: Router = Router();

router.get("/:menuId", validate({ params: MenuIdParamsSchema }), controller.getMenu);
router.get(
  "/:menuId/items",
  validate({ params: MenuIdParamsSchema }),
  controller.getMenuItems,
);

// ─── OpenAPI ─────────────────────────────────────────────
const tag = "Catalog";
const errorRef = { $ref: "#/components/schemas/ErrorResponse" };
const menuIdParam = { name: "menuId", in: "path", required: true, schema: { type: "string" as const } } as const;

routeRegistry.push({
  path: "/api/v1/menus/{menuId}",
  pathItem: {
    get: {
      tags: [tag],
      summary: "Get a menu with its items",
      parameters: [menuIdParam],
      responses: {
        "200": { description: "Menu", content: { "application/json": { schema: { $ref: "#/components/schemas/MenuSuccessResponse" } } } },
        "404": { description: "Menu not found", content: { "application/json": { schema: errorRef } } },
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
        "200": { description: "Items", content: { "application/json": { schema: { $ref: "#/components/schemas/MenuItemListSuccessResponse" } } } },
        "404": { description: "Menu not found", content: { "application/json": { schema: errorRef } } },
      },
    },
  },
});

export default router;
