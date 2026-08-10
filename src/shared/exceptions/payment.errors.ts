export const paymentErrors = {
  UNSUPPORTED_METHOD: {
    message: "Payment method is not supported",
    statusCode: 400,
  },
  PAYMENT_FAILED: {
    message: "Payment processing failed",
    statusCode: 402,
  },

  WEBHOOK_SIGNATURE_INVALID: {
    message: "Webhook signature verification failed",
    statusCode: 400,
  },
  REFUND_NOT_FOUND: {
    message: "Refund not found",
    statusCode: 404,
  },

  REFUND_ALREADY_SETTLED: {
    message: "This refund has already been paid back",
    statusCode: 409,
  },
  REFUND_NO_PAYMENT: {
    message: "No successful payment found for this order to refund against",
    statusCode: 409,
  },

  INTEGRATION_DISABLED: {
    message: "Payment method is not supported",
    statusCode: 400,
  },
  INTEGRATION_NOT_FOUND: {
    message: "Payment integration not found",
    statusCode: 404,
  },
} as const;
