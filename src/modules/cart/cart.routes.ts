import { Router } from "express";
import { validate } from "../../middlewares/validate.middleware";
import {
  authenticate,
  authorize,
  optionalAuthenticate,
} from "../../middlewares/auth.middleware";
import { routeRegistry } from "../../openapi/registry";
import * as controller from "./cart.controller";
import {
  AddCartItemRequestSchema,
  CartItemIdParamsSchema,
  MergeGuestCartRequestSchema,
  UpdateCartItemRequestSchema,
} from "./cart.validation";

const router: Router = Router();

router.use(optionalAuthenticate);

router.get("/", controller.getMyCart);

router.post(
  "/",
  validate({ body: AddCartItemRequestSchema }),
  controller.addItem,
);

router.post(
  "/merge",
  authenticate,
  validate({ body: MergeGuestCartRequestSchema }),
  controller.mergeGuestCart,
);

router.post(
  "/housekeeping",
  authenticate,
  authorize("ADMIN"),
  controller.sweepAbandonedCarts,
);

router.patch(
  "/:itemId",
  validate({
    body: UpdateCartItemRequestSchema,
    params: CartItemIdParamsSchema,
  }),
  controller.updateItem,
);

router.delete(
  "/:itemId",
  validate({ params: CartItemIdParamsSchema }),
  controller.removeItem,
);

router.delete("/", controller.clearCart);

const tag = "Cart";
const errorRef = {
  $ref: "#/components/schemas/ErrorResponse",
};
const validationErrorRef = {
  $ref: "#/components/schemas/ValidationErrorResponse",
};
const security: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { BearerAuth: [] },
];

const cartTokenParam = {
  name: "X-Cart-Token",
  in: "header",
  required: false,
  schema: { type: "string" as const },
  description:
    "Guest cart token. Omit it while signed in. Anonymous visitors receive one in the first add-item response and send it on every later cart call.",
} as const;

routeRegistry.push({
  path: "/api/v1/carts",
  pathItem: {
    get: {
      tags: [tag],
      security,
      summary: "Get my cart (signed-in customer or guest token)",
      parameters: [cartTokenParam],
      responses: {
        "200": {
          description: "Cart retrieved successfully",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CartSuccessResponse" },
            },
          },
        },
        "400": {
          description: "Neither signed in nor carrying a guest token",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
    delete: {
      tags: [tag],
      security,
      summary: "Clear my cart (delete all items)",
      parameters: [cartTokenParam],
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
  path: "/api/v1/carts",
  pathItem: {
    post: {
      tags: [tag],
      security,
      summary: "Add item to cart (upserts quantity if item exists)",
      description:
        "Open to anonymous visitors: without an auth token a guest cart is created and its token is returned in the X-Cart-Token response header.",
      parameters: [cartTokenParam],
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
          headers: {
            "X-Cart-Token": {
              description:
                "Guest cart token — present only for anonymous carts",
              schema: { type: "string" },
            },
          },
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CartSuccessResponse" },
            },
          },
        },
        "400": {
          description: "Validation failed / item from a different restaurant",
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
  path: "/api/v1/carts/merge",
  pathItem: {
    post: {
      tags: [tag],
      security,
      summary: "Merge a guest cart into my cart after signing in",
      description:
        "No cart of my own → the guest cart is handed over as-is. Same restaurant → quantities are summed per item. Different restaurant → 400. An unknown or already-merged token is a no-op, so the call is safe to retry.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/MergeGuestCartRequest" },
          },
        },
      },
      responses: {
        "200": {
          description: "Merged cart",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CartSuccessResponse" },
            },
          },
        },
        "400": {
          description: "Guest cart is from a different restaurant",
          content: { "application/json": { schema: errorRef } },
        },
        "401": {
          description: "Not authenticated",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/carts/housekeeping",
  pathItem: {
    post: {
      tags: [tag],
      security,
      summary: "Sweep abandoned carts now (ADMIN)",
      description:
        "Runs the same cleanup as the background sweeper: guest carts idle past CART_GUEST_TTL_HOURS and customer carts idle past CART_CUSTOMER_TTL_DAYS are deleted with their items.",
      responses: {
        "200": {
          description: "Sweep result",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CartSweepSuccessResponse" },
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
  path: "/api/v1/carts/{itemId}",
  pathItem: {
    patch: {
      tags: [tag],
      security,
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
      security,
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
