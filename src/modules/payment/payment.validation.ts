import { z } from "zod";
import { schemaRegistry } from "../../openapi/registry";
import {
  PAYMENT_METHODS,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
} from "../transaction/transaction.model";

// ═══════════════════════════════════════════════════════════════
// Request Schemas (inputs)
// ═══════════════════════════════════════════════════════════════

export const TransactionIdParamsSchema = z
  .object({
    transactionId: z.cuid2().meta({ description: "Transaction (refund) ID" }),
  })
  .meta({ id: "TransactionIdParams" });

export const OutstandingRefundsQuerySchema = z
  .object({
    limit: z.preprocess(
      (value) => (value === undefined || value === "" ? 100 : value),
      z.coerce.number().int().min(1).max(200),
    ),
  })
  .meta({
    id: "OutstandingRefundsQuery",
    description: "How many outstanding refunds to return (oldest first)",
  });

// ═══════════════════════════════════════════════════════════════
// Response Schemas (outputs)
// ═══════════════════════════════════════════════════════════════

export const TransactionResponseSchema = z
  .object({
    id: z.cuid2(),
    type: z.enum(TRANSACTION_TYPES),
    status: z.enum(TRANSACTION_STATUSES),
    amount: z.number(),
    currency: z.string(),
    paymentMethod: z.enum(PAYMENT_METHODS),
    internalTxNumber: z.string(),
    externalRef: z.string().nullable().meta({
      description: "The gateway's own reference, once there is one",
    }),
    orderId: z.cuid2().nullable(),
    error: z.string().nullable().meta({
      description: "Why the last attempt failed, when it did",
    }),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "TransactionResponse" });

export const OutstandingRefundsResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.array(TransactionResponseSchema),
  })
  .meta({
    id: "OutstandingRefundsResponse",
    description:
      "Refunds that have not reached the customer — FAILED and PENDING. Every row here is money still owed.",
  });

export const TransactionSuccessResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: TransactionResponseSchema,
  })
  .meta({ id: "TransactionSuccessResponse" });

// ═══════════════════════════════════════════════════════════════
// Registry
// ═══════════════════════════════════════════════════════════════

schemaRegistry.register("TransactionIdParams", TransactionIdParamsSchema);
schemaRegistry.register(
  "OutstandingRefundsQuery",
  OutstandingRefundsQuerySchema,
);
schemaRegistry.register("TransactionResponse", TransactionResponseSchema);
schemaRegistry.register(
  "OutstandingRefundsResponse",
  OutstandingRefundsResponseSchema,
);
schemaRegistry.register(
  "TransactionSuccessResponse",
  TransactionSuccessResponseSchema,
);

// ═══════════════════════════════════════════════════════════════
// TypeScript Types
// ═══════════════════════════════════════════════════════════════

export type TransactionIdParams = z.infer<typeof TransactionIdParamsSchema>;
export type OutstandingRefundsQuery = z.infer<
  typeof OutstandingRefundsQuerySchema
>;
export type TransactionResponse = z.infer<typeof TransactionResponseSchema>;
