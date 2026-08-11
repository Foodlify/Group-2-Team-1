import type { CartModel, CartItemModel } from "../../generated/prisma/models";

export type CartWithItems = CartModel & {
  cartItems: Array<CartItemModel>;
};

export type CartOwner = { customerId: string } | { guestToken: string };

export const isGuestOwner = (
  owner: CartOwner,
): owner is { guestToken: string } => "guestToken" in owner;
