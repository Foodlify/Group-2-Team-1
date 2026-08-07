export const orderErrors = {
  ORDER_NOT_FOUND: {
    message: "Order not found",
    statusCode: 404,
  },
  ORDER_FORBIDDEN: {
    message: "This order does not belong to you",
    statusCode: 403,
  },
  ORDER_NOT_CANCELLABLE: {
    message: "Only PENDING orders can be cancelled",
    statusCode: 400,
  },
  INVALID_STATUS_TRANSITION: {
    message: "Invalid status transition",
    statusCode: 400,
  },
  MENU_ITEM_NOT_FOUND: {
    message: "Menu item not found",
    statusCode: 404,
  },
  CUSTOMER_NOT_FOUND: {
    message: "Customer not found",
    statusCode: 404,
  },
  ADDRESS_NOT_FOUND: {
    message: "Address not found",
    statusCode: 404,
  },
  ADDRESS_FORBIDDEN: {
    message: "This address does not belong to you",
    statusCode: 403,
  },
  CART_NOT_FOUND: {
    message: "Cart not found",
    statusCode: 404,
  },
  CART_EMPTY: {
    message: "Cannot place order with an empty cart",
    statusCode: 400,
  },
  MENU_ITEM_UNAVAILABLE: {
    message: "One or more menu items in your cart are no longer available",
    statusCode: 409,
  },
  OUT_OF_STOCK: {
    message: "One or more items in your cart are out of stock",
    statusCode: 409,
  },
  PRICE_CHANGED: {
    message:
      "Prices of one or more cart items have changed. Please review your cart.",
    statusCode: 409,
  },
} as const;
