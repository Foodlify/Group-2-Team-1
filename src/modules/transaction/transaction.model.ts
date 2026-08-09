import env from "../../config/env";

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
 *
 * `CREDIT_CARD` is conditional on the same env var that decides whether the
 * Stripe strategy gets registered, so the two can never disagree: without a
 * secret key the method is absent from the request schema *and* from the
 * generated OpenAPI document, and a client sending it gets a 400 from
 * validation rather than a 500 from a missing strategy.
 *
 * Read from `env` rather than importing payment.service: transaction.model is
 * a leaf that payment.service depends on, and the reverse import would be a
 * cycle.
 */
export const SUPPORTED_PAYMENT_METHODS: [
  SupportedPaymentMethod,
  ...SupportedPaymentMethod[],
] = env.STRIPE_SECRET_KEY ? ["CASH", "CREDIT_CARD"] : ["CASH"];

export type SupportedPaymentMethod = "CASH" | "CREDIT_CARD";
