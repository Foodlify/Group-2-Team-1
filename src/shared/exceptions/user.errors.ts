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
} as const;
