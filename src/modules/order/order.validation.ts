import { z } from "zod";
import { schemaRegistry } from "../../openapi/registry";
import { ORDER_STATUSES } from "../orderStatus/orderStatus.model";
import { PaginationMetaSchema } from "../../shared/schemas/pagination.schema";

// ═══════════════════════════════════════════════════════════════
// Request Schemas (inputs)
// ═══════════════════════════════════════════════════════════════

export const PlaceOrderRequestSchema = z
  .object({
    addressId: z.cuid2().meta({
      description: "ID of the delivery address",
      example: "clxyz...",
    }),
    items: z
      .array(
        z.object({
          menuItemId: z.cuid2().meta({
            description: "ID of the menu item",
            example: "clabc...",
          }),
          quantity: z.number().int().positive().meta({
            description: "Quantity to order",
            example: 2,
          }),
        }),
      )
      .min(1)
      .meta({ description: "Order line items (at least one required)" }),
  })
  .meta({
    id: "PlaceOrderRequest",
    description: "Payload to place a new order",
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

export const OrderStatusResponseSchema = z
  .object({
    orderId: z.cuid2(),
    status: z.enum(ORDER_STATUSES),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "OrderStatusResponse" });

export const OrderTrackingResponseSchema = z
  .object({
    id: z.cuid2(),
    orderId: z.cuid2(),
    currentLocation: z.string(),
    estimatedDeliveryTime: z.iso.datetime(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "OrderTrackingResponse" });

export const OrderResponseSchema = z
  .object({
    id: z.cuid2(),
    customerId: z.cuid2(),
    addressId: z.cuid2(),
    orderDate: z.iso.datetime(),
    status: z.enum(ORDER_STATUSES),
    items: z.array(OrderItemResponseSchema),
    trackings: z.array(OrderTrackingResponseSchema),
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
schemaRegistry.register("OrderItemResponse", OrderItemResponseSchema);
schemaRegistry.register("OrderStatusResponse", OrderStatusResponseSchema);
schemaRegistry.register("OrderTrackingResponse", OrderTrackingResponseSchema);
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
export type OrderResponse = z.infer<typeof OrderResponseSchema>;
export type OrderListItemResponse = z.infer<typeof OrderListItemResponseSchema>;
