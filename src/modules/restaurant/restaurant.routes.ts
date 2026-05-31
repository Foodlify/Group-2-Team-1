import { Router } from "express";
import { validate } from "../../middlewares/validate.middleware";
import { routeRegistry } from "../../openapi/registry";
import * as controller from "./restaurant.controller";
import {
  RestaurantIdParamsSchema,
  RestaurantQuerySchema,
} from "./restaurant.validation";

const router: Router = Router();

router.get("/", validate({ query: RestaurantQuerySchema }), controller.listRestaurants);
router.get(
  "/:restaurantId",
  validate({ params: RestaurantIdParamsSchema }),
  controller.getRestaurant,
);
router.get(
  "/:restaurantId/menus",
  validate({ params: RestaurantIdParamsSchema }),
  controller.getRestaurantMenus,
);

// ─── OpenAPI ─────────────────────────────────────────────
const tag = "Catalog";
const errorRef = { $ref: "#/components/schemas/ErrorResponse" };
const restaurantIdParam = { name: "restaurantId", in: "path", required: true, schema: { type: "string" as const } } as const;

routeRegistry.push({
  path: "/api/v1/restaurants",
  pathItem: {
    get: {
      tags: [tag],
      summary: "List restaurants (paginated, optional name search)",
      parameters: [
        { name: "page", in: "query", schema: { type: "integer", default: 1 } },
        { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
        { name: "search", in: "query", schema: { type: "string" }, description: "Case-insensitive name search" },
      ],
      responses: {
        "200": { description: "Restaurants", content: { "application/json": { schema: { $ref: "#/components/schemas/RestaurantListSuccessResponse" } } } },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/restaurants/{restaurantId}",
  pathItem: {
    get: {
      tags: [tag],
      summary: "Get a restaurant by ID",
      parameters: [restaurantIdParam],
      responses: {
        "200": { description: "Restaurant", content: { "application/json": { schema: { $ref: "#/components/schemas/RestaurantSuccessResponse" } } } },
        "404": { description: "Restaurant not found", content: { "application/json": { schema: errorRef } } },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/restaurants/{restaurantId}/menus",
  pathItem: {
    get: {
      tags: [tag],
      summary: "List a restaurant's menus",
      parameters: [restaurantIdParam],
      responses: {
        "200": { description: "Menus", content: { "application/json": { schema: { $ref: "#/components/schemas/MenuListSuccessResponse" } } } },
        "404": { description: "Restaurant not found", content: { "application/json": { schema: errorRef } } },
      },
    },
  },
});

export default router;
