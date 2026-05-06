export const PAYMENT_METHODS = ["CASH", "CARD"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const TRANSACTION_STATUSES = ["PENDING", "COMPLETED", "FAILED"] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];
