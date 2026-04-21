import type {
  CartModel,
  CartItemModel,
  MenuItemModel,
} from "../../generated/prisma/models";

/**
 * Cart with eagerly-loaded items and their menuItem details.
 * This is the shape returned by `cartRepository.findByUserIdWithItems()`.
 */
export type CartWithItems = CartModel & {
  items: Array<CartItemModel & { menuItem: MenuItemModel }>;
};
