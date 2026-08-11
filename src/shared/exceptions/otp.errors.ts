export const otpErrors = {
  TOO_MANY_REQUESTS: {
    message: "Too many OTP requests — try again in a few minutes",
    statusCode: 429,
  },

  INVALID_OTP: {
    message: "Invalid or expired OTP",
    statusCode: 400,
  },
  MAIL_NOT_CONFIGURED: {
    message: "Email delivery is not configured",
    statusCode: 503,
  },

  MAIL_SEND_FAILED: {
    message: "Could not send the email — please try again shortly",
    statusCode: 503,
  },
} as const;
