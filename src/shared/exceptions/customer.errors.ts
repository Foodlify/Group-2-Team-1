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
  PAYMENT_SETTING_NOT_FOUND: {
    message: "Payment setting not found",
    statusCode: 404,
  },
  PAYMENT_SETTING_FORBIDDEN: {
    message: "This payment setting does not belong to you",
    statusCode: 403,
  },
  PAYMENT_METHOD_ALREADY_SAVED: {
    message: "This payment method is already saved",
    statusCode: 409,
  },
} as const;
