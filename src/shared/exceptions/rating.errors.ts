export const ratingErrors = {
  ORDER_NOT_FOUND: {
    message: "Order not found",
    statusCode: 404,
  },
  ORDER_NOT_DELIVERED: {
    message: "Only delivered orders can be rated",
    statusCode: 400,
  },
  ALREADY_RATED: {
    message: "This order has already been rated",
    statusCode: 409,
  },
} as const;
