import z from "zod";
import { schemaRegistry } from "../../openapi/registry";

export const OrderResponseSchema = z
  .object({
    id: z.string().cuid(),
    customerId: z.string().cuid(),
    orderDate: z.date(),
    addressId: z.string().cuid(),
    createdAt: z.date(),
    updatedAt: z.date(),
    items: z.array(
      z.object({
        id: z.string().cuid(),
        menuItemId: z.string().cuid(),
        quantity: z.number().int().positive(),
        createdAt: z.date(),
        updatedAt: z.date(),
      }),
    ),
  })
  .meta({ id: "OrderResponse", description: "Order with its line items" });

export const CreateOrderRequestSchema = z.object({
  addressId: z.string().cuid().meta({
    description: "The address ID to deliver the order to",
  }),
}).meta({ id: "CreateOrderRequest", description: "Payload to create an order from cart" });

export const UpdateOrderRequestSchema = z.object({
  addressId: z.string().cuid().optional().meta({
    description: "New delivery address ID",
  }),
}).meta({ id: "UpdateOrderRequest", description: "Payload to update an order" });

export const OrderIdParamsSchema = z.object({
  orderId: z.string().cuid().meta({
    description: "ID of the order",
  }),
}).meta({ id: "OrderIdParams", description: "URL parameters for order operations" });

schemaRegistry.register("OrderResponse", OrderResponseSchema);
schemaRegistry.register("CreateOrderRequest", CreateOrderRequestSchema);
schemaRegistry.register("UpdateOrderRequest", UpdateOrderRequestSchema);
schemaRegistry.register("OrderIdParams", OrderIdParamsSchema);

export type OrderResponse = z.infer<typeof OrderResponseSchema>;
export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;
export type UpdateOrderRequest = z.infer<typeof UpdateOrderRequestSchema>;
export type OrderIdParams = z.infer<typeof OrderIdParamsSchema>;
