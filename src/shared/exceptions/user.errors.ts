export const userErrors = {
  EMAIL_ALREADY_EXISTS: {
    message: "Email already registered",
    statusCode: 409,
  },
  PHONE_ALREADY_EXISTS: {
    message: "Phone already registered",
    statusCode: 409,
  },
  PHONE_REQUIRED: {
    message: "phone is required when role is CUSTOMER",
    statusCode: 400,
  },
  CUSTOMER_PROFILE_REQUIRED: {
    message:
      "Cannot set role to CUSTOMER for an account without a customer profile; register the customer via /auth/register",
    statusCode: 400,
  },
  INVALID_CREDENTIALS: {
    message: "Invalid email or password",
    statusCode: 401,
  },
  USER_NOT_FOUND: {
    message: "User not found",
    statusCode: 404,
  },
  INVALID_REFRESH_TOKEN: {
    message: "Invalid or expired refresh token",
    statusCode: 401,
  },
  FORBIDDEN: {
    message: "You are not allowed to access this resource",
    statusCode: 403,
  },
  EMAIL_NOT_VERIFIED: {
    message:
      "Email not verified. Verify it with the code sent to your inbox via /api/v1/auth/verify-email",
    statusCode: 403,
  },
  EMAIL_ALREADY_VERIFIED: {
    message: "Email is already verified",
    statusCode: 409,
  },
  ACCOUNT_DISABLED: {
    message: "This account is disabled",
    statusCode: 403,
  },
  // 404, not 503: a deployment without Google credentials does not offer this
  // sign-in method at all. Same reading as an unregistered payment method.
  GOOGLE_NOT_CONFIGURED: {
    message: "Google sign-in is not available on this deployment",
    statusCode: 404,
  },
  // Covers a code that was invented, expired, or already spent, and a token
  // that failed verification. Deliberately one message: which of them it was
  // is only useful to somebody probing the endpoint.
  GOOGLE_EXCHANGE_FAILED: {
    message: "Google sign-in failed",
    statusCode: 401,
  },
  // The `state` round-trip is the only thing standing between a user and being
  // signed into an attacker's account by following a link, so a mismatch is
  // refused outright rather than repaired.
  GOOGLE_STATE_MISMATCH: {
    message: "Google sign-in could not be verified. Start again.",
    statusCode: 400,
  },
  // Google will hand out a token for an address the account has not proven it
  // owns. Linking on one would let anybody with such an account walk into the
  // password account that already holds that address.
  GOOGLE_EMAIL_UNVERIFIED: {
    message: "This Google account's email address is not verified",
    statusCode: 403,
  },
} as const;
