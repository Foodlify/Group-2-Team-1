export const paymentErrors = {
  UNSUPPORTED_METHOD: {
    message: "Payment method is not supported",
    statusCode: 400,
  },
  PAYMENT_FAILED: {
    message: "Payment processing failed",
    statusCode: 402,
  },
} as const;
