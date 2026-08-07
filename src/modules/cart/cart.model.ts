import type { CartModel, CartItemModel } from "../../generated/prisma/models";

export type CartWithItems = CartModel & {
  cartItems: Array<CartItemModel>;
};

/**
 * Who a cart belongs to: a signed-in customer or an anonymous visitor.
 * Both fields are `@unique` in the schema, so this doubles as a valid Prisma
 * `where` for findUnique/updateMany — no translation layer needed.
 */
export type CartOwner = { customerId: string } | { guestToken: string };

export const isGuestOwner = (
  owner: CartOwner,
): owner is { guestToken: string } => "guestToken" in owner;
