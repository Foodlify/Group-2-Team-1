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
  // Configured but unreachable — the real production failure mode, and the one
  // that used to surface as a bare 500. 503 says "try again", which is true:
  // the account and its code already exist, so a retry re-sends rather than
  // re-registers.
  MAIL_SEND_FAILED: {
    message: "Could not send the email — please try again shortly",
    statusCode: 503,
  },
} as const;
