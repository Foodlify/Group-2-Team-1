import type { Router } from "express";
import { defineRoutes } from "../../openapi/route-builder";
import {
  ErrorResponseSchema,
  ValidationErrorResponseSchema,
} from "../../shared/schemas/error.schema";
import * as controller from "./cart.controller";
import {
  AddCartItemRequestSchema,
  CartItemIdParamsSchema,
  CartSuccessResponseSchema,
  EmptySuccessResponseSchema,
  UpdateCartItemRequestSchema,
} from "./cart.validation";

const router: Router = defineRoutes({
  basePath: "/api/v1/carts",
  tag: "Cart",
  routes: [
    {
      method: "get",
      path: "/",
      auth: "user",
      summary: "Get my cart",
      responses: {
        200: { description: "Cart retrieved successfully", schema: CartSuccessResponseSchema },
      },
      handler: controller.getMyCart,
    },
    {
      method: "post",
      path: "/",
      auth: "user",
      summary: "Add item to cart (upserts quantity if item exists)",
      request: { body: AddCartItemRequestSchema },
      responses: {
        201: { description: "Item added", schema: CartSuccessResponseSchema },
        400: { description: "Validation failed", schema: ValidationErrorResponseSchema },
        404: { description: "Menu item not found", schema: ErrorResponseSchema },
      },
      handler: controller.addItem,
    },
    {
      method: "patch",
      path: "/:itemId",
      auth: "user",
      summary: "Update item quantity",
      request: { params: CartItemIdParamsSchema, body: UpdateCartItemRequestSchema },
      responses: {
        200: { description: "Item updated", schema: CartSuccessResponseSchema },
        403: { description: "Item does not belong to you", schema: ErrorResponseSchema },
        404: { description: "Item not found", schema: ErrorResponseSchema },
      },
      handler: controller.updateItem,
    },
    {
      method: "delete",
      path: "/:itemId",
      auth: "user",
      summary: "Remove a specific item from cart",
      request: { params: CartItemIdParamsSchema },
      responses: {
        200: { description: "Item removed", schema: CartSuccessResponseSchema },
        403: { description: "Item does not belong to you", schema: ErrorResponseSchema },
        404: { description: "Item not found", schema: ErrorResponseSchema },
      },
      handler: controller.removeItem,
    },
    {
      method: "delete",
      path: "/",
      auth: "user",
      summary: "Clear my cart (delete all items)",
      responses: {
        200: { description: "Cart cleared", schema: EmptySuccessResponseSchema },
      },
      handler: controller.clearCart,
    },
  ],
});

export default router;
