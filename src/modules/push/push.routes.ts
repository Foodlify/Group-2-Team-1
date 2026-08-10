import { Router } from "express";
import { validate } from "../../middlewares/validate.middleware";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { routeRegistry } from "../../openapi/registry";
import * as controller from "./push.controller";
import {
  PushSubscriptionRequestSchema,
  UnsubscribeRequestSchema,
} from "./push.validation";

const router: Router = Router();

router.get("/public-key", controller.getPublicKey);

router.use(authenticate, authorize("CUSTOMER"));

router.get("/subscriptions", controller.listMine);
router.post(
  "/subscriptions",
  validate({ body: PushSubscriptionRequestSchema }),
  controller.subscribe,
);
router.delete(
  "/subscriptions",
  validate({ body: UnsubscribeRequestSchema }),
  controller.unsubscribe,
);

const tag = "Notifications";
const errorRef = { $ref: "#/components/schemas/ErrorResponse" };
const validationErrorRef = {
  $ref: "#/components/schemas/ValidationErrorResponse",
};
const security: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { BearerAuth: [] },
];

routeRegistry.push({
  path: "/api/v1/push/public-key",
  pathItem: {
    get: {
      tags: [tag],
      summary: "The VAPID public key a browser needs to subscribe",
      description:
        "Unauthenticated, because the key is public by design and a page needs it before anyone signs in. 404 when this deployment has no VAPID keys configured — push is off, rather than broken, and a client that received an empty string would fail deep inside the browser instead.",
      responses: {
        "200": {
          description: "Public key",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/PushKeySuccessResponse" },
            },
          },
        },
        "404": {
          description: "Push is not configured on this deployment",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/push/subscriptions",
  pathItem: {
    get: {
      tags: [tag],
      security,
      summary: "List my registered browsers",
      description:
        "The subscription keys are never returned — they are the browser's half of the payload encryption and only somebody copying a subscription elsewhere would want them.",
      responses: {
        "200": {
          description: "Subscriptions",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/PushSubscriptionListSuccessResponse",
              },
            },
          },
        },
        "403": {
          description: "Not a customer",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
    post: {
      tags: [tag],
      security,
      summary: "Register this browser for order notifications",
      description:
        "Post the browser's subscription object as-is. Re-posting one that is already registered refreshes it instead of duplicating it: browsers hand back the same endpoint on every page load, and a duplicate row would mean every notification arriving twice on one device.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/PushSubscriptionRequest" },
          },
        },
      },
      responses: {
        "201": {
          description: "Subscribed",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/PushSubscriptionSuccessResponse",
              },
            },
          },
        },
        "400": {
          description: "Validation failed",
          content: { "application/json": { schema: validationErrorRef } },
        },
        "403": {
          description: "Not a customer",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
    delete: {
      tags: [tag],
      security,
      summary: "Stop notifications to one browser",
      description:
        "Scoped to your own subscriptions, so knowing an endpoint is not enough to silence somebody else's notifications — that case answers 404, the same as an endpoint that does not exist.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/PushUnsubscribeRequest" },
          },
        },
      },
      responses: {
        "200": { description: "Unsubscribed" },
        "403": {
          description: "Not a customer",
          content: { "application/json": { schema: errorRef } },
        },
        "404": {
          description: "No such subscription of yours",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});

export default router;
