import type { CartModel, CartItemModel } from "../../generated/prisma/models";

export type CartWithItems = CartModel & {
  cartItems: Array<CartItemModel>;
};
