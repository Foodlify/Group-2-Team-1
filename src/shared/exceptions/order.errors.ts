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
} as const;
