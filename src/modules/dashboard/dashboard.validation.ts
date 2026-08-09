import { z } from "zod";
import { schemaRegistry } from "../../openapi/registry";
import { REPORT_GRANULARITIES } from "./dashboard.model";

// ═══════════════════════════════════════════════════════════════
// Request Schemas (inputs)
// ═══════════════════════════════════════════════════════════════

export const ReportQuerySchema = z
  .object({
    granularity: z.enum(REPORT_GRANULARITIES).default("day").meta({
      description: "Bucket size for the series: daily or monthly",
      example: "day",
    }),
    from: z.iso.datetime().optional().meta({
      description:
        "Start of the window, inclusive (ISO 8601). Defaults to 30 days before `to`.",
      example: "2026-07-01T00:00:00.000Z",
    }),
    to: z.iso.datetime().optional().meta({
      description: "End of the window, EXCLUSIVE (ISO 8601). Defaults to now.",
      example: "2026-08-01T00:00:00.000Z",
    }),
  })
  .refine(
    (data) => !data.from || !data.to || new Date(data.from) < new Date(data.to),
    { message: "'from' must be earlier than 'to'", path: ["from"] },
  )
  .meta({
    id: "ReportQuery",
    description: "Reporting window and bucket size",
  });

export const RestaurantIdParamsSchema = z
  .object({
    restaurantId: z.cuid2().meta({ description: "Restaurant ID" }),
  })
  .meta({ id: "DashboardRestaurantIdParams" });

// ═══════════════════════════════════════════════════════════════
// Response Schemas (outputs)
// ═══════════════════════════════════════════════════════════════

const MoneySchema = z.object({
  payments: z
    .number()
    .meta({ description: "Money received (successful payments)" }),
  refunds: z
    .number()
    .meta({ description: "Money returned (successful refunds)" }),
  net: z.number().meta({ description: "payments − refunds" }),
});

export const OverviewResponseSchema = z
  .object({
    generatedAt: z.iso.datetime(),
    timezone: z.literal("UTC").meta({
      description:
        "Day and month boundaries are UTC — see docs/DASHBOARD.md for why",
    }),
    counters: z.object({
      restaurants: z.number().int().meta({
        description: "Restaurants that are not soft-deleted",
      }),
      customers: z.number().int(),
      activeCustomers: z.number().int().meta({
        description: "Customers whose user account is enabled",
      }),
      orders: z.number().int(),
      ordersToday: z.number().int(),
      ordersThisMonth: z.number().int(),
      cancelledOrders: z.number().int(),
      deliveredOrders: z.number().int(),
      transactions: z
        .number()
        .int()
        .meta({
          description:
            "All transaction rows regardless of status — activity, not money. " +
            "Revenue below counts SUCCESS only.",
        }),
    }),
    ordersByStatus: z.record(z.string(), z.number().int()).meta({
      description:
        "Order count per status — statuses with no orders are absent",
    }),
    revenue: z.object({
      allTime: MoneySchema,
      today: MoneySchema,
      thisMonth: MoneySchema,
    }),
  })
  .meta({ id: "DashboardOverview" });

export const TransactionReportResponseSchema = z
  .object({
    granularity: z.enum(REPORT_GRANULARITIES),
    from: z.iso.datetime(),
    to: z.iso.datetime().meta({ description: "Exclusive upper bound" }),
    timezone: z.literal("UTC"),
    currency: z.literal("EGP"),
    transactions: z.number().int().meta({
      description: "Successful transactions in the window",
    }),
    totals: MoneySchema,
    series: z.array(
      MoneySchema.extend({
        period: z.iso.datetime().meta({
          description: "Start of the bucket (UTC)",
        }),
        transactions: z.number().int(),
      }),
    ),
  })
  .meta({
    id: "TransactionReport",
    description:
      "Successful transactions bucketed by day or month. Refunds are subtracted from payments, never added.",
  });

export const RestaurantReportResponseSchema = z
  .object({
    restaurantId: z.cuid2(),
    name: z.string(),
    counters: z.object({
      orders: z.number().int(),
      ordersInRange: z.number().int(),
      cancelledOrders: z.number().int(),
      deliveredOrders: z.number().int(),
    }),
    ordersByStatus: z.record(z.string(), z.number().int()),
    revenueAllTime: MoneySchema,
    report: TransactionReportResponseSchema,
  })
  .meta({ id: "RestaurantReport" });

export const OverviewSuccessResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: OverviewResponseSchema,
  })
  .meta({ id: "DashboardOverviewSuccessResponse" });

export const TransactionReportSuccessResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: TransactionReportResponseSchema,
  })
  .meta({ id: "TransactionReportSuccessResponse" });

export const RestaurantReportSuccessResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: RestaurantReportResponseSchema,
  })
  .meta({ id: "RestaurantReportSuccessResponse" });

// ═══════════════════════════════════════════════════════════════
// Registry
// ═══════════════════════════════════════════════════════════════

schemaRegistry.register("ReportQuery", ReportQuerySchema);
schemaRegistry.register(
  "DashboardRestaurantIdParams",
  RestaurantIdParamsSchema,
);
schemaRegistry.register("DashboardOverview", OverviewResponseSchema);
schemaRegistry.register("TransactionReport", TransactionReportResponseSchema);
schemaRegistry.register("RestaurantReport", RestaurantReportResponseSchema);
schemaRegistry.register(
  "DashboardOverviewSuccessResponse",
  OverviewSuccessResponseSchema,
);
schemaRegistry.register(
  "TransactionReportSuccessResponse",
  TransactionReportSuccessResponseSchema,
);
schemaRegistry.register(
  "RestaurantReportSuccessResponse",
  RestaurantReportSuccessResponseSchema,
);

// ═══════════════════════════════════════════════════════════════
// TypeScript Types
// ═══════════════════════════════════════════════════════════════

export type ReportQuery = z.infer<typeof ReportQuerySchema>;
export type RestaurantIdParams = z.infer<typeof RestaurantIdParamsSchema>;
export type OverviewResponse = z.infer<typeof OverviewResponseSchema>;
export type TransactionReportResponse = z.infer<
  typeof TransactionReportResponseSchema
>;
export type RestaurantReportResponse = z.infer<
  typeof RestaurantReportResponseSchema
>;
