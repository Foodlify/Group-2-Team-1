import { Router } from "express";
import { validate } from "../../middlewares/validate.middleware";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { routeRegistry } from "../../openapi/registry";
import * as controller from "./transaction.controller";
import {
  TransactionIdParamsSchema,
  TransactionListQuerySchema,
} from "./transaction.validation";

export const myTransactionsRouter: Router = Router();

myTransactionsRouter.use(authenticate);

myTransactionsRouter.get(
  "/",
  validate({ query: TransactionListQuerySchema }),
  controller.listMyTransactions,
);

myTransactionsRouter.get(
  "/:transactionId/receipt",
  validate({ params: TransactionIdParamsSchema }),
  controller.getMyReceipt,
);

export const adminTransactionsRouter: Router = Router();

adminTransactionsRouter.use(authenticate, authorize("ADMIN"));

adminTransactionsRouter.get(
  "/",
  validate({ query: TransactionListQuerySchema }),
  controller.listAllTransactions,
);

adminTransactionsRouter.get(
  "/:transactionId/receipt",
  validate({ params: TransactionIdParamsSchema }),
  controller.getReceipt,
);

const tag = "Transactions";
const errorRef = { $ref: "#/components/schemas/ErrorResponse" };
const validationErrorRef = {
  $ref: "#/components/schemas/ValidationErrorResponse",
};
const security: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { BearerAuth: [] },
];

const listParams = [
  {
    name: "page",
    in: "query" as const,
    schema: { type: "integer" as const, default: 1 },
  },
  {
    name: "limit",
    in: "query" as const,
    schema: { type: "integer" as const, default: 20, maximum: 100 },
  },
  {
    name: "type",
    in: "query" as const,
    schema: {
      type: "string" as const,
      enum: ["ORDER_PAYMENT", "REFUND", "PARTIAL_REFUND"],
    },
  },
  {
    name: "status",
    in: "query" as const,
    schema: {
      type: "string" as const,
      enum: ["PENDING", "SUCCESS", "FAILED"],
    },
  },
  {
    name: "orderId",
    in: "query" as const,
    schema: { type: "string" as const },
  },
];

const transactionIdParam = {
  name: "transactionId",
  in: "path" as const,
  required: true,
  schema: { type: "string" as const },
};

const listResponses = {
  "200": {
    description: "A page of transactions, newest first",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/TransactionListSuccessResponse" },
      },
    },
  },
  "400": {
    description: "Invalid filter or pagination value",
    content: { "application/json": { schema: validationErrorRef } },
  },
  "401": {
    description: "Not signed in",
    content: { "application/json": { schema: errorRef } },
  },
};

const receiptResponses = {
  "200": {
    description: "The receipt",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/ReceiptSuccessResponse" },
      },
    },
  },
  "404": {
    description: "No such transaction, or it belongs to someone else",
    content: { "application/json": { schema: errorRef } },
  },
  "409": {
    description: "The transaction has not settled, or has no order to itemise",
    content: { "application/json": { schema: errorRef } },
  },
};

routeRegistry.push({
  path: "/api/v1/customers/me/transactions",
  pathItem: {
    get: {
      tags: [tag],
      security,
      summary: "The signed-in customer's payment transactions",
      description:
        "Payments and refunds belonging to this customer's own orders, newest first. Ownership runs through the order, so a transaction not attached to one of the caller's orders is never returned.",
      parameters: listParams,
      responses: listResponses,
    },
  },
});

routeRegistry.push({
  path: "/api/v1/customers/me/transactions/{transactionId}/receipt",
  pathItem: {
    get: {
      tags: [tag],
      security,
      summary: "Receipt for one of the customer's own transactions",
      description:
        "Rendered on demand from the order's own snapshots — the item names and prices as they were at checkout, not as they are now. Only settled (SUCCESS) transactions have a receipt.",
      parameters: [transactionIdParam],
      responses: receiptResponses,
    },
  },
});

routeRegistry.push({
  path: "/api/v1/transactions",
  pathItem: {
    get: {
      tags: [tag],
      security,
      summary: "Every payment transaction, with gateway details (ADMIN)",
      description:
        "The whole ledger, newest first, filterable by type, status and order. Each row carries its `details` — the gateway's own session and PaymentIntent ids, raw status and failure text. The customer's own listing deliberately does not.",
      parameters: listParams,
      responses: {
        ...listResponses,
        "200": {
          description: "A page of transactions with their gateway details",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/AdminTransactionListSuccessResponse",
              },
            },
          },
        },
        "403": {
          description: "Not an admin",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/transactions/{transactionId}/receipt",
  pathItem: {
    get: {
      tags: [tag],
      security,
      summary: "Receipt for any transaction (ADMIN)",
      description:
        "Same document as the customer's, without the ownership restriction.",
      parameters: [transactionIdParam],
      responses: {
        ...receiptResponses,
        "403": {
          description: "Not an admin",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});
