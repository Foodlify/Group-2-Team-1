export {
  TransactionType,
  TransactionStatus,
  PaymentMethod,
} from "../../generated/prisma/enums";

// Arrays kept for Zod schema definitions
export const TRANSACTION_TYPES = [
  "ORDER_PAYMENT",
  "REFUND",
  "PARTIAL_REFUND",
] as const;

export const TRANSACTION_STATUSES = ["PENDING", "SUCCESS", "FAILED"] as const;

export const PAYMENT_METHODS = [
  "CASH",
  "CREDIT_CARD",
  "PAYPAL",
  "WALLET",
] as const;
