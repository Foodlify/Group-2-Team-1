export const transactionErrors = {
  TRANSACTION_NOT_FOUND: {
    message: "Transaction not found",
    statusCode: 404,
  },

  RECEIPT_NOT_SETTLED: {
    message: "No receipt: this transaction has not settled",
    statusCode: 409,
  },
  RECEIPT_NO_ORDER: {
    message: "No receipt: this transaction is not attached to an order",
    statusCode: 409,
  },
} as const;
