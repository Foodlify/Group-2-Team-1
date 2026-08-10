import { z } from "zod";
import { schemaRegistry } from "../../openapi/registry";
import {
  PaginationMetaSchema,
  PaginationQuerySchema,
} from "../../shared/schemas/pagination.schema";
import {
  PAYMENT_METHODS,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
} from "./transaction.model";
import { TransactionResponseSchema } from "../payment/payment.validation";

// ═══════════════════════════════════════════════════════════════
// Request Schemas (inputs)
// ═══════════════════════════════════════════════════════════════

export const TransactionListQuerySchema = PaginationQuerySchema.extend({
  type: z.enum(TRANSACTION_TYPES).optional().meta({
    description: "Only payments, only refunds, ...",
    example: "ORDER_PAYMENT",
  }),
  status: z.enum(TRANSACTION_STATUSES).optional().meta({
    description: "Filter by settlement state",
    example: "SUCCESS",
  }),
  orderId: z.cuid2().optional().meta({
    description: "Only transactions belonging to this order",
  }),
}).meta({
  id: "TransactionListQuery",
  description: "Filters for the transaction listing",
});

export const TransactionIdParamsSchema = z
  .object({
    transactionId: z.cuid2().meta({ description: "Transaction ID" }),
  })
  .meta({ id: "TransactionIdOnlyParams" });

// ═══════════════════════════════════════════════════════════════
// Response Schemas (outputs)
// ═══════════════════════════════════════════════════════════════

export const ReceiptResponseSchema = z
  .object({
    receiptNumber: z.string().meta({
      description:
        "The internal transaction number — the receipt's own reference",
      example: "REF-order_123-1786300000000",
    }),
    issuedAt: z.iso.datetime().meta({
      description:
        "When this document was generated. Receipts are rendered on demand, not stored, so two requests for the same transaction differ here and nowhere else.",
    }),
    transaction: z.object({
      id: z.cuid2(),
      type: z.enum(TRANSACTION_TYPES),
      status: z.enum(TRANSACTION_STATUSES),
      paymentMethod: z.enum(PAYMENT_METHODS),
      amount: z.number(),
      currency: z.string(),
      externalRef: z.string().nullable().meta({
        description: "The gateway's own reference, when one exists",
      }),
      settledAt: z.iso.datetime(),
    }),
    order: z.object({
      id: z.cuid2(),
      status: z.string(),
      orderedAt: z.iso.datetime(),
      restaurant: z.string(),
      orderTotal: z.number().meta({
        description: "The order's frozen total, as recorded at checkout",
      }),
      itemsTotal: z.number().meta({
        description:
          "Sum of the line totals. Computed in Decimal and equal to orderTotal for any order placed through checkout — shown separately so a discrepancy is visible rather than hidden.",
      }),
    }),
    customer: z.object({
      name: z.string(),
      email: z.email(),
      phone: z.string(),
    }),
    deliveryAddress: z.string(),
    items: z.array(
      z.object({
        name: z.string().meta({
          description: "The item's name at order time, not its current one",
        }),
        quantity: z.number().int(),
        unitPrice: z.number(),
        lineTotal: z.number(),
      }),
    ),
  })
  .meta({
    id: "Receipt",
    description: "Proof of a settled payment or refund, rendered on demand",
  });

export const TransactionListSuccessResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.array(TransactionResponseSchema),
    meta: PaginationMetaSchema,
  })
  .meta({ id: "TransactionListSuccessResponse" });

export const ReceiptSuccessResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: ReceiptResponseSchema,
  })
  .meta({ id: "ReceiptSuccessResponse" });

// ═══════════════════════════════════════════════════════════════
// Registry
// ═══════════════════════════════════════════════════════════════

schemaRegistry.register("TransactionListQuery", TransactionListQuerySchema);
schemaRegistry.register("Receipt", ReceiptResponseSchema);
schemaRegistry.register(
  "TransactionListSuccessResponse",
  TransactionListSuccessResponseSchema,
);
schemaRegistry.register("ReceiptSuccessResponse", ReceiptSuccessResponseSchema);

export type TransactionListQueryInput = z.infer<
  typeof TransactionListQuerySchema
>;
export type TransactionIdParams = z.infer<typeof TransactionIdParamsSchema>;
export type ReceiptResponse = z.infer<typeof ReceiptResponseSchema>;
