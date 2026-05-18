import { z } from "zod";
import { schemaRegistry } from "../../openapi/registry";
import { ORDER_STATUSES } from "./order.status";
import { PAYMENT_METHODS } from "../transaction/transaction.model";
import {
  PaginationMetaSchema,
  PaginationQuerySchema,
} from "../../shared/schemas/pagination.schema";

// ═══════════════════════════════════════════════════════════════
// Request Schemas (inputs)
// ═══════════════════════════════════════════════════════════════

export const PlaceOrderRequestSchema = z
  .object({
    addressId: z.cuid2().meta({
      description: "ID of the delivery address",
      example: "clxyz...",
    }),
    paymentMethod: z.enum(PAYMENT_METHODS).meta({
      description: "Payment method to use for this order",
      example: "CASH",
    }),
  })
  .meta({
    id: "PlaceOrderRequest",
    description:
      "Payload to place a new order. Order items are read from the customer's cart.",
  });

export const UpdateStatusRequestSchema = z
  .object({
    status: z.enum(ORDER_STATUSES).meta({
      description: "New order status",
      example: "CONFIRMED",
    }),
  })
  .meta({
    id: "UpdateStatusRequest",
    description: "Payload to update an order's status",
  });

export const AddTrackingRequestSchema = z
  .object({
    currentLocation: z.string().min(1).meta({
      description: "Current delivery location",
      example: "Warehouse District, Cairo",
    }),
    estimatedDeliveryTime: z.iso.datetime().meta({
      description: "Estimated delivery time (ISO 8601)",
      example: "2025-05-03T18:00:00.000Z",
    }),
  })
  .meta({
    id: "AddTrackingRequest",
    description: "Payload to add a tracking update to an order",
  });

export const OrderIdParamsSchema = z
  .object({
    orderId: z.cuid2().meta({
      description: "Order ID",
      example: "clord...",
    }),
  })
  .meta({ id: "OrderIdParams" });

export const OrderQuerySchema = PaginationQuerySchema.extend({
  from: z.iso.datetime().optional().meta({
    description: "Filter orders created on or after this date (ISO 8601)",
    example: "2026-04-01T00:00:00.000Z",
  }),
  to: z.iso.datetime().optional().meta({
    description: "Filter orders created on or before this date (ISO 8601)",
    example: "2026-05-01T00:00:00.000Z",
  }),
})
  .refine(
    (data) => !data.from || !data.to || new Date(data.from) <= new Date(data.to),
    { message: "'from' must be earlier than or equal to 'to'", path: ["from"] },
  )
  .meta({
    id: "OrderQuery",
    description: "Pagination + optional date range filter for orders",
  });

// ═══════════════════════════════════════════════════════════════
// Response Schemas (outputs)
// ═══════════════════════════════════════════════════════════════

export const OrderItemResponseSchema = z
  .object({
    id: z.cuid2(),
    menuItemId: z.cuid2(),
    name: z.string(),
    quantity: z.number().int().positive(),
    price: z.number(),
    subtotal: z.number().meta({ description: "price × quantity" }),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "OrderItemResponse" });

export const TimelineEntrySchema = z
  .object({
    status: z.enum(ORDER_STATUSES),
    changedAt: z.iso.datetime(),
    changedBy: z.string().optional(),
    location: z.string().optional(),
    estimatedDeliveryTime: z.iso.datetime().optional(),
  })
  .meta({ id: "TimelineEntry" });

export const OrderResponseSchema = z
  .object({
    id: z.cuid2(),
    customerId: z.cuid2(),
    addressId: z.cuid2(),
    orderDate: z.iso.datetime(),
    status: z.enum(ORDER_STATUSES),
    timeline: z.array(TimelineEntrySchema).meta({
      description:
        "Unified chronological log of status changes and delivery tracking updates, oldest first",
    }),
    items: z.array(OrderItemResponseSchema),
    totalPrice: z.number().meta({
      description: "Sum of (price × quantity) for all items",
      example: 45.5,
    }),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "OrderResponse" });

export const OrderListItemResponseSchema = z
  .object({
    id: z.cuid2(),
    customerId: z.cuid2(),
    addressId: z.cuid2(),
    orderDate: z.iso.datetime(),
    status: z.enum(ORDER_STATUSES),
    itemCount: z.number().int().nonnegative().meta({
      description: "Total quantity across all items",
    }),
    totalPrice: z.number(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "OrderListItemResponse" });

export const OrderSuccessResponseSchema = z
  .object({
    success: z.literal(true),
    data: OrderResponseSchema,
  })
  .meta({ id: "OrderSuccessResponse" });

export const OrderListSuccessResponseSchema = z
  .object({
    success: z.literal(true),
    data: z.array(OrderListItemResponseSchema),
    meta: PaginationMetaSchema,
  })
  .meta({ id: "OrderListSuccessResponse" });


// ═══════════════════════════════════════════════════════════════
// Registry
// ═══════════════════════════════════════════════════════════════

schemaRegistry.register("PlaceOrderRequest", PlaceOrderRequestSchema);
schemaRegistry.register("UpdateStatusRequest", UpdateStatusRequestSchema);
schemaRegistry.register("AddTrackingRequest", AddTrackingRequestSchema);
schemaRegistry.register("OrderIdParams", OrderIdParamsSchema);
schemaRegistry.register("OrderQuery", OrderQuerySchema);
schemaRegistry.register("OrderItemResponse", OrderItemResponseSchema);
schemaRegistry.register("TimelineEntry", TimelineEntrySchema);
schemaRegistry.register("OrderResponse", OrderResponseSchema);
schemaRegistry.register("OrderListItemResponse", OrderListItemResponseSchema);
schemaRegistry.register("OrderSuccessResponse", OrderSuccessResponseSchema);
schemaRegistry.register("OrderListSuccessResponse", OrderListSuccessResponseSchema);

// ═══════════════════════════════════════════════════════════════
// TypeScript Types
// ═══════════════════════════════════════════════════════════════

export type PlaceOrderInput = z.infer<typeof PlaceOrderRequestSchema>;
export type UpdateStatusInput = z.infer<typeof UpdateStatusRequestSchema>;
export type AddTrackingInput = z.infer<typeof AddTrackingRequestSchema>;
export type OrderIdParams = z.infer<typeof OrderIdParamsSchema>;
export type OrderQuery = z.infer<typeof OrderQuerySchema>;
export type OrderResponse = z.infer<typeof OrderResponseSchema>;
export type OrderListItemResponse = z.infer<typeof OrderListItemResponseSchema>;
