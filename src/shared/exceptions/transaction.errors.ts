export const transactionErrors = {
  // Also returned when a transaction exists but belongs to a different
  // customer. Distinguishing the two would confirm the id is real to somebody
  // who has no business knowing that.
  TRANSACTION_NOT_FOUND: {
    message: "Transaction not found",
    statusCode: 404,
  },
  // 409, not 404: the row is real, its state is the problem. A receipt is
  // evidence that money moved, so issuing one for a PENDING or FAILED
  // transaction would be proof of a payment that never completed.
  RECEIPT_NOT_SETTLED: {
    message: "No receipt: this transaction has not settled",
    statusCode: 409,
  },
  RECEIPT_NO_ORDER: {
    message: "No receipt: this transaction is not attached to an order",
    statusCode: 409,
  },
} as const;
