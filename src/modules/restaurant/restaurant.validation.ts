import { z } from "zod";
import { schemaRegistry } from "../../openapi/registry";

export const RegisterRestaurantRequestSchema = z
  .object({
    name: z.string().min(1).max(100),
  })
  .meta({
    id: "RegisterRestaurantRequest",
    description: "Payload to register a new restaurant",
  });

export const UpdateRestaurantRequestSchema = z
  .object({
    name: z.string().min(1).max(100),
  })
  .meta({
    id: "UpdateRestaurantRequest",
    description: "Payload to update restaurant name",
  });

export const UpdateOrderStatusSchema = z
  .object({
    status: z.enum(["accepted", "denied", "preparing", "ready_for_delivery", "delivered"]),
  })
  .meta({
    id: "UpdateOrderStatus",
    description: "Update order status by restaurant",
  });

schemaRegistry.register("RegisterRestaurantRequest", RegisterRestaurantRequestSchema);
schemaRegistry.register("UpdateRestaurantRequest", UpdateRestaurantRequestSchema);
schemaRegistry.register("UpdateOrderStatus", UpdateOrderStatusSchema);

export type RegisterRestaurantInput = z.infer<typeof RegisterRestaurantRequestSchema>;
export type UpdateRestaurantInput = z.infer<typeof UpdateRestaurantRequestSchema>;
export type UpdateOrderStatusInput = z.infer<typeof UpdateOrderStatusSchema>;
