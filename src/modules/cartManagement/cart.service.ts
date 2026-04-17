import { Cart } from './cart.repository';
export const addToCartService = () => {};
export const deleteItemService = () => {};
export const updateQuantityService = () => {};
export const viewCartService = () => {
  Cart.getCarts();
};
export const clearCartService = () => {};
