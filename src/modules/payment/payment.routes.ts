import express, { Router } from "express";
import { routeRegistry } from "../../openapi/registry";
import * as controller from "./payment.controller";

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

// ─── OpenAPI Documentation ───────────────────────────────

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
