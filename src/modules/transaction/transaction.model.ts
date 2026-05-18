export const TRANSACTION_TYPES = [
  "ORDER_PAYMENT",
  "REFUND",
  "PARTIAL_REFUND",
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_STATUSES = ["PENDING", "SUCCESS", "FAILED"] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const PAYMENT_METHODS = [
  "CASH",
  "CREDIT_CARD",
  "PAYPAL",
  "WALLET",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
