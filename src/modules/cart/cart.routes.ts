import { Router } from "express";
import { validate } from "../../middlewares/validate.middleware";
import { routeRegistry } from "../../openapi/registry";
import * as controller from "./cart.controller";
import {
  AddCartItemRequestSchema,
  CartItemIdParamsSchema,
  UpdateCartItemRequestSchema,
} from "./cart.validation";

const router: Router = Router();

// ─── Handlers ────────────────────────────────────────────

router.get("/me", controller.getMyCart);

router.post(
  "/me/items",
  validate({ body: AddCartItemRequestSchema }),
  controller.addItem,
);

router.patch(
  "/me/items/:itemId",
  validate({
    body: UpdateCartItemRequestSchema,
    params: CartItemIdParamsSchema,
  }),
  controller.updateItem,
);

router.delete(
  "/me/items/:itemId",
  validate({ params: CartItemIdParamsSchema }),
  controller.removeItem,
);

router.delete("/me", controller.clearCart);

// ─── OpenAPI Documentation ───────────────────────────────

const tag = "Cart";
const errorRef = {
  $ref: "#/components/schemas/ErrorResponse",
};
const validationErrorRef = {
  $ref: "#/components/schemas/ValidationErrorResponse",
};

routeRegistry.push({
  path: "/api/v1/carts/me",
  pathItem: {
    get: {
      tags: [tag],
      summary: "Get my cart",
      responses: {
        "200": {
          description: "Cart retrieved successfully",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CartSuccessResponse" },
            },
          },
        },
      },
    },
    delete: {
      tags: [tag],
      summary: "Clear my cart (delete all items)",
      responses: {
        "200": {
          description: "Cart cleared",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/EmptySuccessResponse" },
            },
          },
        },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/carts/me/items",
  pathItem: {
    post: {
      tags: [tag],
      summary: "Add item to cart (upserts quantity if item exists)",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/AddCartItemRequest" },
          },
        },
      },
      responses: {
        "201": {
          description: "Item added",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CartSuccessResponse" },
            },
          },
        },
        "400": {
          description: "Validation failed",
          content: {
            "application/json": { schema: validationErrorRef },
          },
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
  path: "/api/v1/carts/me/items/{itemId}",
  pathItem: {
    patch: {
      tags: [tag],
      summary: "Update item quantity",
      parameters: [
        {
          name: "itemId",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/UpdateCartItemRequest" },
          },
        },
      },
      responses: {
        "200": {
          description: "Item updated",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CartSuccessResponse" },
            },
          },
        },
        "404": {
          description: "Item not found",
          content: { "application/json": { schema: errorRef } },
        },
        "403": {
          description: "Item does not belong to you",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
    delete: {
      tags: [tag],
      summary: "Remove a specific item from cart",
      parameters: [
        {
          name: "itemId",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: {
        "200": {
          description: "Item removed",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CartSuccessResponse" },
            },
          },
        },
        "404": {
          description: "Item not found",
          content: { "application/json": { schema: errorRef } },
        },
        "403": {
          description: "Item does not belong to you",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});

export default router;
