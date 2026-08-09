export const paymentErrors = {
  UNSUPPORTED_METHOD: {
    message: "Payment method is not supported",
    statusCode: 400,
  },
  PAYMENT_FAILED: {
    message: "Payment processing failed",
    statusCode: 402,
  },
  // 400, not 401/403: the request never presented an identity to reject, it
  // presented a payload we could not prove came from the gateway. Stripe reads
  // any 4xx as "do not retry", which is what we want for a forged call.
  WEBHOOK_SIGNATURE_INVALID: {
    message: "Webhook signature verification failed",
    statusCode: 400,
  },
  REFUND_NOT_FOUND: {
    message: "Refund not found",
    statusCode: 404,
  },
  // 409, not 400: the request was well formed, it just describes an obligation
  // that no longer exists.
  REFUND_ALREADY_SETTLED: {
    message: "This refund has already been paid back",
    statusCode: 409,
  },
  REFUND_NO_PAYMENT: {
    message: "No successful payment found for this order to refund against",
    statusCode: 409,
  },
} as const;
