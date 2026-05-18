import { Router } from "express";
import { validate } from "../../middlewares/validate.middleware";
import { routeRegistry } from "../../openapi/registry";
import * as controller from "./order.controller";
import {
  AddTrackingRequestSchema,
  OrderIdParamsSchema,
  OrderQuerySchema,
  PlaceOrderRequestSchema,
  UpdateStatusRequestSchema,
} from "./order.validation";

const router: Router = Router();

// ─── Handlers ────────────────────────────────────────────

router.post("/", validate({ body: PlaceOrderRequestSchema }), controller.placeOrder);

router.get("/", validate({ query: OrderQuerySchema }), controller.getMyOrders);

router.get(
  "/:orderId",
  validate({ params: OrderIdParamsSchema }),
  controller.getOrderById,
);

router.delete(
  "/:orderId",
  validate({ params: OrderIdParamsSchema }),
  controller.cancelOrder,
);

router.patch(
  "/:orderId/status",
  validate({ params: OrderIdParamsSchema, body: UpdateStatusRequestSchema }),
  controller.updateOrderStatus,
);

router.post(
  "/:orderId/tracking",
  validate({ params: OrderIdParamsSchema, body: AddTrackingRequestSchema }),
  controller.addOrderStatusTracking,
);

// ─── OpenAPI Documentation ───────────────────────────────

const tag = "Orders";
const errorRef = { $ref: "#/components/schemas/ErrorResponse" };
const validationErrorRef = { $ref: "#/components/schemas/ValidationErrorResponse" };
const orderIdParam = { name: "orderId", in: "path", required: true, schema: { type: "string" as const } } as const;

routeRegistry.push({
  path: "/api/v1/orders",
  pathItem: {
    post: {
      tags: [tag],
      summary: "Place a new order",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/PlaceOrderRequest" },
          },
        },
      },
      responses: {
        "201": {
          description: "Order placed successfully",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/OrderSuccessResponse" },
            },
          },
        },
        "400": { description: "Validation failed", content: { "application/json": { schema: validationErrorRef } } },
        "404": { description: "Address or menu item not found", content: { "application/json": { schema: errorRef } } },
        "403": { description: "Address does not belong to you", content: { "application/json": { schema: errorRef } } },
      },
    },
    get: {
      tags: [tag],
      summary: "Get my orders (paginated, with optional date range filter)",
      parameters: [
        { name: "page", in: "query", schema: { type: "integer", default: 1 } },
        { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
        {
          name: "from",
          in: "query",
          schema: { type: "string", format: "date-time" },
          description: "Filter orders created on or after this date (ISO 8601)",
        },
        {
          name: "to",
          in: "query",
          schema: { type: "string", format: "date-time" },
          description: "Filter orders created on or before this date (ISO 8601)",
        },
      ],
      responses: {
        "200": {
          description: "Orders retrieved successfully",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/OrderListSuccessResponse" },
            },
          },
        },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/orders/{orderId}",
  pathItem: {
    get: {
      tags: [tag],
      summary: "Get order by ID",
      parameters: [orderIdParam],
      responses: {
        "200": {
          description: "Order retrieved successfully",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/OrderSuccessResponse" },
            },
          },
        },
        "404": { description: "Order not found", content: { "application/json": { schema: errorRef } } },
        "403": { description: "Order does not belong to you", content: { "application/json": { schema: errorRef } } },
      },
    },
    delete: {
      tags: [tag],
      summary: "Cancel an order (PENDING only)",
      parameters: [orderIdParam],
      responses: {
        "200": {
          description: "Order cancelled",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/OrderSuccessResponse" },
            },
          },
        },
        "400": { description: "Order is not cancellable", content: { "application/json": { schema: errorRef } } },
        "404": { description: "Order not found", content: { "application/json": { schema: errorRef } } },
        "403": { description: "Order does not belong to you", content: { "application/json": { schema: errorRef } } },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/orders/{orderId}/status",
  pathItem: {
    patch: {
      tags: [tag],
      summary: "Update order status (follows valid transitions)",
      parameters: [orderIdParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/UpdateStatusRequest" },
          },
        },
      },
      responses: {
        "200": {
          description: "Status updated",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/OrderSuccessResponse" },
            },
          },
        },
        "400": { description: "Invalid status transition", content: { "application/json": { schema: errorRef } } },
        "404": { description: "Order not found", content: { "application/json": { schema: errorRef } } },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/orders/{orderId}/tracking",
  pathItem: {
    post: {
      tags: [tag],
      summary: "Add a tracking update to an order",
      parameters: [orderIdParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/AddTrackingRequest" },
          },
        },
      },
      responses: {
        "201": {
          description: "Tracking added",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/OrderSuccessResponse" },
            },
          },
        },
        "404": { description: "Order not found", content: { "application/json": { schema: errorRef } } },
      },
    },
  },
});

export default router;
