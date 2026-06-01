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

/**
 * Methods actually wired to a payment strategy (see payment.service). Request
 * validation must use THIS list — not the full `PAYMENT_METHODS` enum — so the
 * API contract never advertises a method that fails at runtime. Add a method
 * here only once a real strategy is registered for it.
 */
export const SUPPORTED_PAYMENT_METHODS = ["CASH"] as const;
