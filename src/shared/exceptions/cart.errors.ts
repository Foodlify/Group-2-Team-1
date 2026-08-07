export const cartErrors = {
  CUSTOMER_NOT_FOUND: {
    message: "Customer not found",
    statusCode: 404,
  },
  MENU_ITEM_NOT_FOUND: {
    message: "Menu item not found",
    statusCode: 404,
  },
  CART_ITEM_NOT_FOUND: {
    message: "Cart item not found",
    statusCode: 404,
  },
  CART_ITEM_FORBIDDEN: {
    message: "This cart item does not belong to you",
    statusCode: 403,
  },
  DIFFERENT_RESTAURANT: {
    message:
      "Cart already has items from a different restaurant. Clear your cart first.",
    statusCode: 400,
  },
  MERGE_DIFFERENT_RESTAURANT: {
    message:
      "Your guest cart is from a different restaurant than your account's cart. Clear one of them, then merge again.",
    statusCode: 400,
  },
  GUEST_TOKEN_REQUIRED: {
    message:
      "Send the X-Cart-Token header returned when the guest cart was created, or sign in",
    statusCode: 400,
  },
} as const;
