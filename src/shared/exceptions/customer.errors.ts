export const customerErrors = {
  NOT_A_CUSTOMER: {
    message: "This account has no customer profile",
    statusCode: 403,
  },
  CUSTOMER_NOT_FOUND: {
    message: "Customer not found",
    statusCode: 404,
  },
  PHONE_ALREADY_EXISTS: {
    message: "Phone already registered",
    statusCode: 409,
  },
  ADDRESS_NOT_FOUND: {
    message: "Address not found",
    statusCode: 404,
  },
  ADDRESS_FORBIDDEN: {
    message: "This address does not belong to you",
    statusCode: 403,
  },
} as const;
