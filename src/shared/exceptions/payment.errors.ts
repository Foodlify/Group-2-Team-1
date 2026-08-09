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
} as const;
