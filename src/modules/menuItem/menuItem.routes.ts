import { Router } from "express";
import { validate } from "../../middlewares/validate.middleware";
import { routeRegistry } from "../../openapi/registry";
import * as controller from "./menuItem.controller";
import { MenuItemIdParamsSchema } from "./menuItem.validation";

const router: Router = Router();

router.get(
  "/:menuItemId",
  validate({ params: MenuItemIdParamsSchema }),
  controller.getMenuItem,
);

// ─── OpenAPI ─────────────────────────────────────────────
routeRegistry.push({
  path: "/api/v1/menu-items/{menuItemId}",
  pathItem: {
    get: {
      tags: ["Catalog"],
      summary: "Get a menu item by ID",
      parameters: [
        { name: "menuItemId", in: "path", required: true, schema: { type: "string" } },
      ],
      responses: {
        "200": {
          description: "Menu item",
          content: { "application/json": { schema: { $ref: "#/components/schemas/MenuItemSuccessResponse" } } },
        },
        "404": {
          description: "Menu item not found",
          content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
        },
      },
    },
  },
});

export default router;
