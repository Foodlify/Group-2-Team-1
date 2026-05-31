export const userErrors = {
  EMAIL_ALREADY_EXISTS: {
    message: "Email already registered",
    statusCode: 409,
  },
  PHONE_ALREADY_EXISTS: {
    message: "Phone already registered",
    statusCode: 409,
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
} as const;
