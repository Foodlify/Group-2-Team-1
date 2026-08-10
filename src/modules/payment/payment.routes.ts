import express, { Router } from "express";
import { routeRegistry } from "../../openapi/registry";
import { validate } from "../../middlewares/validate.middleware";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import * as controller from "./payment.controller";
import {
  OutstandingRefundsQuerySchema,
  TransactionIdParamsSchema,
} from "./payment.validation";
import {
  IntegrationCodeParamsSchema,
  UpdateIntegrationRequestSchema,
} from "./integration.validation";

/**
 * The Stripe webhook, on its own router because of where it must be mounted.
 *
 * It is attached in `app.ts` BEFORE `express.json()` and outside the `/api/v1`
 * router, for two reasons:
 *
 *   - `express.raw` has to see the untouched body. Once the global JSON parser
 *     has consumed the stream, re-serialising the object gives different bytes
 *     and every signature check fails.
 *   - it must bypass `apiLimiter`. Stripe retries a failed delivery for three
 *     days; answering 429 would turn a traffic spike into lost payment
 *     confirmations. The signature check is the protection here, not the rate
 *     limit.
 */
export const paymentWebhookRouter: Router = Router();

paymentWebhookRouter.post(
  "/",
  express.raw({ type: "application/json" }),
  controller.stripeWebhook,
);

/**
 * Admin refund management, mounted normally under `/api/v1/payments`.
 *
 * Separate router from the webhook above because this one *wants* everything
 * the webhook must avoid: JSON parsing, the rate limiter, and real
 * authentication. The webhook is matched first in `app.ts` (its path is more
 * specific and mounted earlier), so the two never collide.
 */
export const paymentAdminRouter: Router = Router();

paymentAdminRouter.use(authenticate, authorize("ADMIN"));

paymentAdminRouter.get(
  "/refunds/outstanding",
  validate({ query: OutstandingRefundsQuerySchema }),
  controller.listOutstandingRefunds,
);

paymentAdminRouter.post(
  "/refunds/:transactionId/retry",
  validate({ params: TransactionIdParamsSchema }),
  controller.retryRefund,
);

// The official `Payment Integration Type` / `Payment Integration
// Configuration` tables. Read-and-configure only: there is no create or delete,
// because an integration exists when a strategy is written for it in code, not
// when a row is inserted. A row for a gateway with no strategy behind it would
// advertise a payment method that fails at the moment someone tries to pay.
paymentAdminRouter.get("/integrations", controller.listIntegrations);

paymentAdminRouter.patch(
  "/integrations/:code",
  validate({
    params: IntegrationCodeParamsSchema,
    body: UpdateIntegrationRequestSchema,
  }),
  controller.updateIntegration,
);

// ─── OpenAPI Documentation ───────────────────────────────

const adminSecurity: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { BearerAuth: [] },
];
const errorRef = { $ref: "#/components/schemas/ErrorResponse" };

routeRegistry.push({
  path: "/api/v1/payments/refunds/outstanding",
  pathItem: {
    get: {
      tags: ["Payments"],
      security: adminSecurity,
      summary: "Refunds that have not reached the customer (ADMIN)",
      description:
        "FAILED and PENDING refunds, oldest first. Every row is money still owed — a FAILED one the gateway rejected, or a PENDING one we never heard back about.",
      parameters: [
        {
          name: "limit",
          in: "query",
          schema: { type: "integer", default: 100, maximum: 200 },
        },
      ],
      responses: {
        "200": {
          description: "Outstanding refunds",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/OutstandingRefundsResponse",
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
  path: "/api/v1/payments/refunds/{transactionId}/retry",
  pathItem: {
    post: {
      tags: ["Payments"],
      security: adminSecurity,
      summary: "Retry one unsettled refund (ADMIN)",
      description:
        "Sends the refund to the gateway again. Safe to repeat: the gateway is first asked whether it already holds a refund for this ledger row, so a retry reconciles rather than paying twice. Deliberately manual — nothing retries refunds on a timer.",
      parameters: [
        {
          name: "transactionId",
          in: "path",
          required: true,
          schema: { type: "string" as const },
        },
      ],
      responses: {
        "200": {
          description: "The refund's state after the attempt",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/TransactionSuccessResponse",
              },
            },
          },
        },
        "404": {
          description: "No such refund",
          content: { "application/json": { schema: errorRef } },
        },
        "409": {
          description: "Already settled, or no payment to refund against",
          content: { "application/json": { schema: errorRef } },
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
  path: "/api/v1/payments/stripe/webhook",
  pathItem: {
    post: {
      tags: ["Payments"],
      summary: "Stripe webhook (called by Stripe, not by clients)",
      description:
        "Server-to-server callback from Stripe. Authenticated by the " +
        "`Stripe-Signature` header over the raw request body — there is no " +
        "session or token. Handles `checkout.session.completed` (confirms the " +
        "order), `checkout.session.expired` and " +
        "`checkout.session.async_payment_failed` (cancels it and releases the " +
        "reserved stock). Handling is idempotent: redelivered events are " +
        "acknowledged without re-applying.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              description: "A Stripe Event object, sent verbatim by Stripe.",
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Event acknowledged",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { received: { type: "boolean" } },
              },
            },
          },
        },
        "400": {
          description: "Signature verification failed",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
        "500": {
          description: "Handler failed — Stripe will retry",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/payments/integrations",
  pathItem: {
    get: {
      tags: ["Payments"],
      security: adminSecurity,
      summary: "How payments are wired up (ADMIN)",
      description:
        "The official Payment Integration Type and Payment Integration Configuration tables. No secret is ever returned — `secretKeyEnvVar` names the environment variable holding the key, and `secretConfigured` says whether that variable actually has a value on this deployment.",
      responses: {
        "200": {
          description: "Every known payment integration",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/PaymentIntegrationListSuccessResponse",
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
  path: "/api/v1/payments/integrations/{code}",
  pathItem: {
    patch: {
      tags: ["Payments"],
      security: adminSecurity,
      summary: "Enable, disable or reconfigure an integration (ADMIN)",
      description:
        "`isEnabled` is the kill switch: it is read when a payment is taken, so switching a gateway off applies on the next request rather than the next deploy. A payment through a disabled integration is refused with the same 400 an unsupported method gets — telling the caller which of the two it is would report our operational state to whoever asked. No secret is accepted here.",
      parameters: [
        {
          name: "code",
          in: "path" as const,
          required: true,
          schema: { type: "string" as const, example: "stripe" },
        },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/UpdateIntegrationRequest" },
          },
        },
      },
      responses: {
        "200": {
          description: "The updated integration",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/PaymentIntegrationSuccessResponse",
              },
            },
          },
        },
        "400": {
          description: "Empty or invalid payload",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ValidationErrorResponse" },
            },
          },
        },
        "403": {
          description: "Not an admin",
          content: { "application/json": { schema: errorRef } },
        },
        "404": {
          description: "No integration with that code",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});
