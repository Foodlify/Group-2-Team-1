import { z } from "zod";
import { schemaRegistry } from "../../openapi/registry";

// ═══════════════════════════════════════════════════════════════
// Request Schemas (inputs)
// ═══════════════════════════════════════════════════════════════

/**
 * Body schema for POST /carts/me/items
 */
export const AddCartItemRequestSchema = z
  .object({
    restaurantId: z.cuid2().meta({
      description: "ID of the restaurant the item belongs to",
      example: "clresto123...",
    }),
    menuItemId: z.cuid2().meta({
      description: "ID of the menu item to add",
      example: "clxyz...",
    }),
    quantity: z.number().int().positive().max(100).meta({
      description: "Quantity to add (1-100)",
      example: 1,
    }),
  })
  .meta({
    id: "AddCartItemRequest",
    description: "Payload to add an item to the cart",
  });

/**
 * Body schema for PATCH /carts/me/items/:itemId
 */
export const UpdateCartItemRequestSchema = z
  .object({
    quantity: z.number().int().positive().max(100).meta({
      description: "New quantity for the item (1-100)",
      example: 3,
    }),
  })
  .meta({
    id: "UpdateCartItemRequest",
    description: "Payload to update a cart item's quantity",
  });

/**
 * Path parameter schema for routes with :itemId
 */
export const CartItemIdParamsSchema = z
  .object({
    itemId: z.cuid2().meta({
      description: "Cart item ID",
      example: "clabc...",
    }),
  })
  .meta({ id: "CartItemIdParams" });

// ═══════════════════════════════════════════════════════════════
// Response Schemas (outputs)
// ═══════════════════════════════════════════════════════════════

/**
 * Single cart item in responses — includes the menuItem details for convenience.
 */
export const CartItemResponseSchema = z
  .object({
    id: z.cuid2(),
    menuItemId: z.cuid2(),
    quantity: z.number().int().positive(),
    menuItem: z.object({
      id: z.cuid2(),
      name: z.string(),
      price: z.number(),
    }),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "CartItemResponse" });

/**
 * Full cart with items and computed total.
 */
export const CartResponseSchema = z
  .object({
    id: z.cuid2(),
    customerId: z.cuid2(),
    restaurantId: z.cuid2(),
    items: z.array(CartItemResponseSchema),
    totalPrice: z.number().meta({
      description: "Sum of (menuItem.price × quantity) for all items",
      example: 37.98,
    }),
    itemCount: z.number().int().nonnegative().meta({
      description: "Total quantity across all items",
      example: 5,
    }),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "CartResponse" });

/**
 * Standard success wrapper used across all cart endpoints.
 */
export const CartSuccessResponseSchema = z
  .object({
    success: z.literal(true),
    data: CartResponseSchema,
  })
  .meta({ id: "CartSuccessResponse" });

/**
 * Empty success response for delete/clear operations.
 */
export const EmptySuccessResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
  })
  .meta({ id: "EmptySuccessResponse" });

// ═══════════════════════════════════════════════════════════════
// Registry
// ═══════════════════════════════════════════════════════════════

schemaRegistry.register("AddCartItemRequest", AddCartItemRequestSchema);
schemaRegistry.register("UpdateCartItemRequest", UpdateCartItemRequestSchema);
schemaRegistry.register("CartItemIdParams", CartItemIdParamsSchema);
schemaRegistry.register("CartItemResponse", CartItemResponseSchema);
schemaRegistry.register("CartResponse", CartResponseSchema);
schemaRegistry.register("CartSuccessResponse", CartSuccessResponseSchema);
schemaRegistry.register("EmptySuccessResponse", EmptySuccessResponseSchema);

// ═══════════════════════════════════════════════════════════════
// TypeScript Types
// ═══════════════════════════════════════════════════════════════

export type AddCartItemInput = z.infer<typeof AddCartItemRequestSchema>;
export type UpdateCartItemInput = z.infer<typeof UpdateCartItemRequestSchema>;
export type CartItemIdParams = z.infer<typeof CartItemIdParamsSchema>;
export type CartResponse = z.infer<typeof CartResponseSchema>;
