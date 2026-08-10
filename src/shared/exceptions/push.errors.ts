export const pushErrors = {
  // 404, not 503: from the caller's side a deployment without VAPID keys has
  // no push feature at all, which is a fact about this deployment rather than
  // a fault. Same reading as an unregistered payment method.
  PUSH_NOT_CONFIGURED: {
    message: "Push notifications are not available on this deployment",
    statusCode: 404,
  },
  // Covers both "no such subscription" and "not yours" — deliberately the same
  // answer, so an endpoint cannot be probed for whether somebody else
  // registered it.
  SUBSCRIPTION_NOT_FOUND: {
    message: "Push subscription not found",
    statusCode: 404,
  },
} as const;
