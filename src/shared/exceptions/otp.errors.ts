export const otpErrors = {
  TOO_MANY_REQUESTS: {
    message: "Too many OTP requests — try again in a few minutes",
    statusCode: 429,
  },
  // One message for absent/expired/wrong codes so a caller can't probe which
  // part failed (avoids leaking whether an email has a pending code).
  INVALID_OTP: {
    message: "Invalid or expired OTP",
    statusCode: 400,
  },
  MAIL_NOT_CONFIGURED: {
    message: "Email delivery is not configured",
    statusCode: 503,
  },
} as const;
