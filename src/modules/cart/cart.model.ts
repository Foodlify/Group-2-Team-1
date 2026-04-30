import type { CartModel, CartItemModel } from "../../generated/prisma/models";

export type CartWithItems = CartModel & {
  items: Array<CartItemModel>;
};
