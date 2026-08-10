import { Router } from "express";
import { validate } from "../../middlewares/validate.middleware";
import {
  authenticate,
  authorize,
  optionalAuthenticate,
} from "../../middlewares/auth.middleware";
import { routeRegistry } from "../../openapi/registry";
import { IncludeDeletedQuerySchema } from "../menu/menu.validation";
import {
  OrderIdParamsSchema,
  ScopedOrderQuerySchema,
} from "../order/order.validation";
import * as controller from "./restaurant.controller";
import {
  AssignOwnerRequestSchema,
  CreateRestaurantRequestSchema,
  RestaurantIdParamsSchema,
  RestaurantQuerySchema,
  UpdateRestaurantRequestSchema,
} from "./restaurant.validation";

const router: Router = Router();

router.get(
  "/me/orders",
  authenticate,
  authorize("RESTAURANT"),
  validate({ query: ScopedOrderQuerySchema }),
  controller.getMyRestaurantOrders,
);
router.get(
  "/me/orders/:orderId",
  authenticate,
  authorize("RESTAURANT"),
  validate({ params: OrderIdParamsSchema }),
  controller.getMyRestaurantOrder,
);

router.get(
  "/",
  optionalAuthenticate,
  validate({ query: RestaurantQuerySchema }),
  controller.listRestaurants,
);
router.get(
  "/:restaurantId",
  validate({ params: RestaurantIdParamsSchema }),
  controller.getRestaurant,
);
router.get(
  "/:restaurantId/menus",
  optionalAuthenticate,
  validate({
    params: RestaurantIdParamsSchema,
    query: IncludeDeletedQuerySchema,
  }),
  controller.getRestaurantMenus,
);

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
  validate({
    params: RestaurantIdParamsSchema,
    body: UpdateRestaurantRequestSchema,
  }),
  controller.updateRestaurant,
);
router.delete(
  "/:restaurantId",
  authenticate,
  authorize("ADMIN"),
  validate({ params: RestaurantIdParamsSchema }),
  controller.deleteRestaurant,
);
router.patch(
  "/:restaurantId/restore",
  authenticate,
  authorize("ADMIN"),
  validate({ params: RestaurantIdParamsSchema }),
  controller.restoreRestaurant,
);
router.patch(
  "/:restaurantId/owner",
  authenticate,
  authorize("ADMIN"),
  validate({
    params: RestaurantIdParamsSchema,
    body: AssignOwnerRequestSchema,
  }),
  controller.assignRestaurantOwner,
);

const tag = "Catalog";
const errorRef = { $ref: "#/components/schemas/ErrorResponse" };
const validationErrorRef = {
  $ref: "#/components/schemas/ValidationErrorResponse",
};
const restaurantIdParam = {
  name: "restaurantId",
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
  path: "/api/v1/restaurants",
  pathItem: {
    get: {
      tags: [tag],
      summary: "List restaurants (paginated, optional name search)",
      description:
        "Deliberately does not carry contact and location details. Those live in their own table so that this query — the most-run read in the system — does not pay for them; fetch one restaurant by id to get them.",
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
          description: "Case-insensitive name search",
        },
        {
          name: "includeDeleted",
          in: "query",
          schema: { type: "boolean" },
          description:
            "Include soft-deleted restaurants. Requires an ADMIN token; ignored otherwise.",
        },
      ],
      responses: {
        "200": {
          description: "Restaurants",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/RestaurantListSuccessResponse",
              },
            },
          },
        },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/restaurants/{restaurantId}",
  pathItem: {
    get: {
      tags: [tag],
      summary: "Get a restaurant by ID, with its contact and location details",
      description:
        "`details` is null for a restaurant registered without them — a real state, not a placeholder.",
      parameters: [restaurantIdParam],
      responses: {
        "200": {
          description: "Restaurant",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/RestaurantSuccessResponse",
              },
            },
          },
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
  path: "/api/v1/restaurants/{restaurantId}/menus",
  pathItem: {
    get: {
      tags: [tag],
      summary: "List a restaurant's menus",
      parameters: [
        restaurantIdParam,
        {
          name: "includeDeleted",
          in: "query",
          schema: { type: "boolean" },
          description:
            "Include soft-deleted menus. Requires an ADMIN token; ignored otherwise.",
        },
      ],
      responses: {
        "200": {
          description: "Menus",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/MenuListSuccessResponse" },
            },
          },
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
  path: "/api/v1/restaurants",
  pathItem: {
    post: {
      tags: [tag],
      summary: "Create a restaurant (ADMIN)",
      description:
        "`details` is optional at registration and can be added later with PATCH. Both rows are written in one transaction, so a restaurant is never left half-registered.",
      security,
      requestBody: jsonBody("CreateRestaurantRequest"),
      responses: {
        "201": {
          description: "Created",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/RestaurantSuccessResponse",
              },
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
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/restaurants/{restaurantId}",
  pathItem: {
    patch: {
      tags: [tag],
      summary: "Update a restaurant's name, its details, or both (ADMIN)",
      description:
        "Send at least one of `name` or `details`; an empty body is rejected rather than reported as a successful no-op. A `details` object REPLACES any existing details — it is not merged into them.",
      security,
      parameters: [restaurantIdParam],
      requestBody: jsonBody("UpdateRestaurantRequest"),
      responses: {
        "200": {
          description: "Updated",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/RestaurantSuccessResponse",
              },
            },
          },
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
    delete: {
      tags: [tag],
      summary: "Delete a restaurant (ADMIN)",
      description:
        "Soft delete — the restaurant and its whole catalog stop appearing in every read, but the rows stay so past orders keep resolving. Reversible via the restore endpoint.",
      security,
      parameters: [restaurantIdParam],
      responses: {
        "200": { description: "Deleted" },
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
  path: "/api/v1/restaurants/{restaurantId}/restore",
  pathItem: {
    patch: {
      tags: [tag],
      summary: "Restore a soft-deleted restaurant (ADMIN)",
      description:
        "Undoes a delete, bringing the restaurant's menus and items back with it. Find the id with `GET /restaurants?includeDeleted=true`.",
      security,
      parameters: [restaurantIdParam],
      responses: {
        "200": {
          description: "Restored",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/RestaurantSuccessResponse",
              },
            },
          },
        },
        "403": {
          description: "Forbidden",
          content: { "application/json": { schema: errorRef } },
        },
        "404": {
          description: "Restaurant not found",
          content: { "application/json": { schema: errorRef } },
        },
        "409": {
          description: "Restaurant is not deleted",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/restaurants/{restaurantId}/owner",
  pathItem: {
    patch: {
      tags: [tag],
      summary: "Assign or clear a restaurant's owner (ADMIN)",
      description:
        "The only way ownership is established — there is no self-registration for owners. The account must already have the RESTAURANT role; promote it via `PATCH /users/{id}` first. Send `null` to take the restaurant back and leave it admin-run.",
      security,
      parameters: [restaurantIdParam],
      requestBody: jsonBody("AssignOwnerRequest"),
      responses: {
        "200": {
          description: "Owner updated",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/RestaurantOwnerSuccessResponse",
              },
            },
          },
        },
        "400": {
          description: "The account does not have the RESTAURANT role",
          content: { "application/json": { schema: errorRef } },
        },
        "403": {
          description: "Forbidden",
          content: { "application/json": { schema: errorRef } },
        },
        "404": {
          description: "Restaurant or user not found",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});

const ordersTag = "Orders";

routeRegistry.push({
  path: "/api/v1/restaurants/me/orders",
  pathItem: {
    get: {
      tags: [ordersTag],
      summary: "Restaurants Order History — orders for the restaurants I run",
      description:
        "Scoped by ownership, not by the role: a RESTAURANT token sees the orders of the restaurants assigned to that account and nothing else. Ownership is resolved on every request, so an admin's reassignment takes effect immediately rather than at token expiry. An account that runs no restaurant gets an empty page.",
      security,
      parameters: [
        { name: "page", in: "query", schema: { type: "integer", default: 1 } },
        {
          name: "limit",
          in: "query",
          schema: { type: "integer", default: 20 },
        },
        {
          name: "status",
          in: "query",
          schema: { type: "string" },
          description: "Filter by order status",
        },
        {
          name: "from",
          in: "query",
          schema: { type: "string", format: "date-time" },
          description: "Orders created on or after this date (ISO 8601)",
        },
        {
          name: "to",
          in: "query",
          schema: { type: "string", format: "date-time" },
          description: "Orders created on or before this date (ISO 8601)",
        },
        {
          name: "restaurantId",
          in: "query",
          schema: { type: "string" },
          description:
            "Narrow to one of your restaurants. One you do not own yields an empty page, not an error.",
        },
      ],
      responses: {
        "200": {
          description: "Orders",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/OrderListSuccessResponse" },
            },
          },
        },
        "403": {
          description: "Forbidden",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/restaurants/me/orders/{orderId}",
  pathItem: {
    get: {
      tags: [ordersTag],
      summary: "One of my restaurants' orders, with its items",
      description:
        "The list carries an item count; a kitchen needs the items. An order belonging to a restaurant you do not run returns the same 403, with the same message, that a customer gets for another customer's order.",
      security,
      parameters: [
        {
          name: "orderId",
          in: "path",
          required: true,
          schema: { type: "string" as const },
        },
      ],
      responses: {
        "200": {
          description: "Order",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/OrderSuccessResponse" },
            },
          },
        },
        "403": {
          description: "This order does not belong to you",
          content: { "application/json": { schema: errorRef } },
        },
        "404": {
          description: "Order not found",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});

export default router;
