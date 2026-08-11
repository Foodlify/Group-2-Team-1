export const pushErrors = {
  PUSH_NOT_CONFIGURED: {
    message: "Push notifications are not available on this deployment",
    statusCode: 404,
  },

  SUBSCRIPTION_NOT_FOUND: {
    message: "Push subscription not found",
    statusCode: 404,
  },
} as const;
