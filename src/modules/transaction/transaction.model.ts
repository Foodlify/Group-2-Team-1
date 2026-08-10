import env from "../../config/env";

export {
  TransactionType,
  TransactionStatus,
  PaymentMethod,
} from "../../generated/prisma/enums";

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

export const SUPPORTED_PAYMENT_METHODS: [
  SupportedPaymentMethod,
  ...SupportedPaymentMethod[],
] = env.STRIPE_SECRET_KEY ? ["CASH", "CREDIT_CARD"] : ["CASH"];

export type SupportedPaymentMethod = "CASH" | "CREDIT_CARD";
