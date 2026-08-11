import { Router } from "express";
import { validate } from "../../middlewares/validate.middleware";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { routeRegistry } from "../../openapi/registry";
import * as controller from "./dashboard.controller";
import {
  ReportQuerySchema,
  RestaurantIdParamsSchema,
} from "./dashboard.validation";

const router: Router = Router();

router.use(authenticate, authorize("ADMIN"));

router.get("/overview", controller.getOverview);

router.get(
  "/transactions",
  validate({ query: ReportQuerySchema }),
  controller.getTransactionReport,
);

router.get(
  "/restaurants/:restaurantId",
  validate({ params: RestaurantIdParamsSchema, query: ReportQuerySchema }),
  controller.getRestaurantReport,
);

const tag = "Dashboard";
const errorRef = { $ref: "#/components/schemas/ErrorResponse" };
const validationErrorRef = {
  $ref: "#/components/schemas/ValidationErrorResponse",
};
const security: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { BearerAuth: [] },
];

const reportParams = [
  {
    name: "granularity",
    in: "query" as const,
    schema: { type: "string" as const, enum: ["day", "month"], default: "day" },
    description: "Bucket size for the series",
  },
  {
    name: "from",
    in: "query" as const,
    schema: { type: "string" as const, format: "date-time" },
    description:
      "Start of the window, inclusive. Defaults to 30 days before `to`.",
  },
  {
    name: "to",
    in: "query" as const,
    schema: { type: "string" as const, format: "date-time" },
    description: "End of the window, exclusive. Defaults to now.",
  },
];

const forbidden = {
  description: "Not an admin",
  content: { "application/json": { schema: errorRef } },
};

routeRegistry.push({
  path: "/api/v1/dashboard/overview",
  pathItem: {
    get: {
      tags: [tag],
      security,
      summary: "System counters and revenue (ADMIN)",
      description:
        "Restaurant, customer, order and transaction counters, plus revenue for all time, today and this month. Day and month boundaries are UTC. Cancelled orders are reported three ways — all time, today and this month — because the scope map asks for the daily and monthly figures by name and an all-time total cannot be narrowed to either.",
      responses: {
        "200": {
          description: "Overview",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/DashboardOverviewSuccessResponse",
              },
            },
          },
        },
        "403": forbidden,
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/dashboard/transactions",
  pathItem: {
    get: {
      tags: [tag],
      security,
      summary: "Daily or monthly transaction report (ADMIN)",
      description:
        "Successful transactions bucketed by day or month. Refunds are subtracted from payments, and only SUCCESS rows count — a pending payment is not money received.",
      parameters: reportParams,
      responses: {
        "200": {
          description: "Report",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/TransactionReportSuccessResponse",
              },
            },
          },
        },
        "400": {
          description: "Invalid window",
          content: { "application/json": { schema: validationErrorRef } },
        },
        "403": forbidden,
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/dashboard/restaurants/{restaurantId}",
  pathItem: {
    get: {
      tags: [tag],
      security,
      summary: "Counters and transaction report for one restaurant (ADMIN)",
      description:
        "Carries the counters the scope map names under Dashboard → Restaurants: orders and cancelled orders for the UTC day and month, and `notDeliveredToday` — today's orders still owed to a customer, which excludes cancelled ones as well as delivered ones. `ordersInRange` is the only counter that follows the `from`/`to` window; the rest are fixed to today and this month.",
      parameters: [
        {
          name: "restaurantId",
          in: "path",
          required: true,
          schema: { type: "string" as const },
        },
        ...reportParams,
      ],
      responses: {
        "200": {
          description: "Restaurant report",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/RestaurantReportSuccessResponse",
              },
            },
          },
        },
        "404": {
          description: "Restaurant not found (or soft-deleted)",
          content: { "application/json": { schema: errorRef } },
        },
        "403": forbidden,
      },
    },
  },
});

export default router;
