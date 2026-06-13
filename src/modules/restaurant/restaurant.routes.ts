import { Router } from "express";
import { validate } from "../../middlewares/validate.middleware";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { routeRegistry } from "../../openapi/registry";
import * as controller from "./restaurant.controller";
import {
  CreateRestaurantRequestSchema,
  RestaurantIdParamsSchema,
  RestaurantQuerySchema,
  UpdateRestaurantRequestSchema,
} from "./restaurant.validation";

const router: Router = Router();

// ─── Public catalog reads ────────────────────────────────
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

// ─── Admin management (ADMIN only) ───────────────────────
router.post(
  "/",
  authenticate,
  authorize("ADMIN"),
  validate({ body: CreateRestaurantRequestSchema }),
  controller.createRestaurant,
);
router.patch(
  "/:restaurantId",
  authenticate,
  authorize("ADMIN"),
  validate({ params: RestaurantIdParamsSchema, body: UpdateRestaurantRequestSchema }),
  controller.updateRestaurant,
);
router.delete(
  "/:restaurantId",
  authenticate,
  authorize("ADMIN"),
  validate({ params: RestaurantIdParamsSchema }),
  controller.deleteRestaurant,
);

// ─── OpenAPI ─────────────────────────────────────────────
const tag = "Catalog";
const errorRef = { $ref: "#/components/schemas/ErrorResponse" };
const validationErrorRef = { $ref: "#/components/schemas/ValidationErrorResponse" };
const restaurantIdParam = { name: "restaurantId", in: "path", required: true, schema: { type: "string" as const } } as const;
const security: Record<string, string[]>[] = [{ cookieAuth: [] }, { BearerAuth: [] }];
const jsonBody = (ref: string) => ({
  required: true,
  content: { "application/json": { schema: { $ref: `#/components/schemas/${ref}` } } },
});

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

// ─── Admin management docs ───────────────────────────────
routeRegistry.push({
  path: "/api/v1/restaurants",
  pathItem: {
    post: {
      tags: [tag],
      summary: "Create a restaurant (ADMIN)",
      security,
      requestBody: jsonBody("CreateRestaurantRequest"),
      responses: {
        "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/RestaurantSuccessResponse" } } } },
        "400": { description: "Validation failed", content: { "application/json": { schema: validationErrorRef } } },
        "403": { description: "Forbidden", content: { "application/json": { schema: errorRef } } },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/restaurants/{restaurantId}",
  pathItem: {
    patch: {
      tags: [tag],
      summary: "Update a restaurant (ADMIN)",
      security,
      parameters: [restaurantIdParam],
      requestBody: jsonBody("UpdateRestaurantRequest"),
      responses: {
        "200": { description: "Updated", content: { "application/json": { schema: { $ref: "#/components/schemas/RestaurantSuccessResponse" } } } },
        "403": { description: "Forbidden", content: { "application/json": { schema: errorRef } } },
        "404": { description: "Restaurant not found", content: { "application/json": { schema: errorRef } } },
      },
    },
    delete: {
      tags: [tag],
      summary: "Delete a restaurant (ADMIN)",
      security,
      parameters: [restaurantIdParam],
      responses: {
        "200": { description: "Deleted" },
        "403": { description: "Forbidden", content: { "application/json": { schema: errorRef } } },
        "404": { description: "Restaurant not found", content: { "application/json": { schema: errorRef } } },
        "409": { description: "Restaurant referenced by existing orders", content: { "application/json": { schema: errorRef } } },
      },
    },
  },
});

export default router;
