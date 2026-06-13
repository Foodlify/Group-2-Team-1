import type { Router } from "express";
import { defineRoutes } from "../../openapi/route-builder";
import {
  ErrorResponseSchema,
  ValidationErrorResponseSchema,
} from "../../shared/schemas/error.schema";
import * as controller from "./order.controller";
import {
  AddTrackingRequestSchema,
  OrderIdParamsSchema,
  OrderListSuccessResponseSchema,
  OrderQuerySchema,
  OrderSuccessResponseSchema,
  PlaceOrderRequestSchema,
  UpdateStatusRequestSchema,
} from "./order.validation";

const router: Router = defineRoutes({
  basePath: "/api/v1/orders",
  tag: "Orders",
  routes: [
    {
      method: "post",
      path: "/",
      auth: "user",
      summary: "Place a new order",
      description: "Order items are read from the customer's cart.",
      request: { body: PlaceOrderRequestSchema },
      responses: {
        201: {
          description: "Order placed successfully",
          schema: OrderSuccessResponseSchema,
        },
        400: {
          description: "Validation failed",
          schema: ValidationErrorResponseSchema,
        },
        403: {
          description: "Address does not belong to you",
          schema: ErrorResponseSchema,
        },
        404: {
          description: "Address or menu item not found",
          schema: ErrorResponseSchema,
        },
      },
      handler: controller.placeOrder,
    },
    {
      method: "get",
      path: "/",
      auth: "user",
      summary: "Get my orders (paginated, with optional date range filter)",
      request: { query: OrderQuerySchema },
      responses: {
        200: {
          description: "Orders retrieved successfully",
          schema: OrderListSuccessResponseSchema,
        },
      },
      handler: controller.getMyOrders,
    },
    // Admin routes are declared before "/:orderId" so "/admin" isn't captured as an id.
    {
      method: "get",
      path: "/admin",
      auth: ["ADMIN"],
      summary:
        "List all orders across customers (ADMIN, paginated, optional status)",
      request: { query: OrderQuerySchema },
      responses: {
        200: { description: "Orders", schema: OrderListSuccessResponseSchema },
        403: { description: "Forbidden", schema: ErrorResponseSchema },
      },
      handler: controller.listAllOrders,
    },
    {
      method: "get",
      path: "/admin/:orderId",
      auth: ["ADMIN"],
      summary: "Get any order by ID (ADMIN)",
      request: { params: OrderIdParamsSchema },
      responses: {
        200: { description: "Order", schema: OrderSuccessResponseSchema },
        403: { description: "Forbidden", schema: ErrorResponseSchema },
        404: { description: "Order not found", schema: ErrorResponseSchema },
      },
      handler: controller.getAnyOrder,
    },
    {
      method: "get",
      path: "/:orderId",
      auth: "user",
      summary: "Get order by ID",
      request: { params: OrderIdParamsSchema },
      responses: {
        200: {
          description: "Order retrieved successfully",
          schema: OrderSuccessResponseSchema,
        },
        403: {
          description: "Order does not belong to you",
          schema: ErrorResponseSchema,
        },
        404: { description: "Order not found", schema: ErrorResponseSchema },
      },
      handler: controller.getOrderById,
    },
    {
      method: "delete",
      path: "/:orderId",
      auth: "user",
      summary: "Cancel an order (PENDING only)",
      request: { params: OrderIdParamsSchema },
      responses: {
        200: {
          description: "Order cancelled",
          schema: OrderSuccessResponseSchema,
        },
        400: {
          description: "Order is not cancellable",
          schema: ErrorResponseSchema,
        },
        403: {
          description: "Order does not belong to you",
          schema: ErrorResponseSchema,
        },
        404: { description: "Order not found", schema: ErrorResponseSchema },
      },
      handler: controller.cancelOrder,
    },
    {
      method: "patch",
      path: "/:orderId/status",
      auth: ["ADMIN"],
      summary: "Update order status (follows valid transitions)",
      request: { params: OrderIdParamsSchema, body: UpdateStatusRequestSchema },
      responses: {
        200: {
          description: "Status updated",
          schema: OrderSuccessResponseSchema,
        },
        400: {
          description: "Invalid status transition",
          schema: ErrorResponseSchema,
        },
        404: { description: "Order not found", schema: ErrorResponseSchema },
      },
      handler: controller.updateOrderStatus,
    },
    {
      method: "post",
      path: "/:orderId/tracking",
      auth: ["ADMIN"],
      summary: "Add a tracking update to an order",
      request: { params: OrderIdParamsSchema, body: AddTrackingRequestSchema },
      responses: {
        201: {
          description: "Tracking added",
          schema: OrderSuccessResponseSchema,
        },
        404: { description: "Order not found", schema: ErrorResponseSchema },
      },
      handler: controller.addOrderStatusTracking,
    },
  ],
});

export default router;
