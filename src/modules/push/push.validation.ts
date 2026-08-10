import { z } from "zod";
import { schemaRegistry } from "../../openapi/registry";

/**
 * The shape a browser's `PushSubscription.toJSON()` produces, verbatim.
 *
 * Accepted as the browser emits it rather than flattened into our own field
 * names, so a client can post the object straight through. Bending it would
 * mean every caller writing the same adapter.
 */
export const PushSubscriptionRequestSchema = z
  .object({
    endpoint: z
      .url()
      .max(2000)
      .meta({
        description:
          "The push service URL the browser issued. Its host belongs to the " +
          "browser vendor, not to us.",
        example: "https://fcm.googleapis.com/fcm/send/dGhpcyBpcy...",
      }),
    keys: z.object({
      p256dh: z.string().min(1).max(255).meta({
        description: "The subscription's public key, used to encrypt payloads",
      }),
      auth: z.string().min(1).max(255).meta({
        description: "The subscription's auth secret",
      }),
    }),
  })
  .meta({
    id: "PushSubscriptionRequest",
    description:
      "A Web Push subscription as the browser produces it. Re-posting one that " +
      "is already registered refreshes it rather than duplicating it — browsers " +
      "hand back the same endpoint on every page load.",
  });

export const UnsubscribeRequestSchema = z
  .object({
    endpoint: z.url().max(2000).meta({
      description: "The subscription to remove",
    }),
  })
  .meta({
    id: "PushUnsubscribeRequest",
    description: "Removes one browser's subscription",
  });

/**
 * `p256dh` and `auth` are absent by design. They are the browser's half of the
 * payload encryption and a customer listing their devices has no use for them.
 */
export const PushSubscriptionResponseSchema = z
  .object({
    id: z.cuid2(),
    endpoint: z.string(),
    userAgent: z.string().nullable().meta({
      description: "Whatever the browser called itself, to tell devices apart",
    }),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: "PushSubscriptionResponse" });

export const PushKeyResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({
      publicKey: z.string().meta({
        description:
          "The VAPID public key. Public by design — it identifies our sends to " +
          "the push service and can only be used to verify them.",
      }),
    }),
  })
  .meta({ id: "PushKeySuccessResponse" });

export const PushSubscriptionSuccessResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: PushSubscriptionResponseSchema,
  })
  .meta({ id: "PushSubscriptionSuccessResponse" });

export const PushSubscriptionListSuccessResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.array(PushSubscriptionResponseSchema),
  })
  .meta({ id: "PushSubscriptionListSuccessResponse" });

schemaRegistry.register(
  "PushSubscriptionRequest",
  PushSubscriptionRequestSchema,
);
schemaRegistry.register("PushUnsubscribeRequest", UnsubscribeRequestSchema);
schemaRegistry.register(
  "PushSubscriptionResponse",
  PushSubscriptionResponseSchema,
);
schemaRegistry.register("PushKeySuccessResponse", PushKeyResponseSchema);
schemaRegistry.register(
  "PushSubscriptionSuccessResponse",
  PushSubscriptionSuccessResponseSchema,
);
schemaRegistry.register(
  "PushSubscriptionListSuccessResponse",
  PushSubscriptionListSuccessResponseSchema,
);

export type PushSubscriptionInput = z.infer<
  typeof PushSubscriptionRequestSchema
>;
export type UnsubscribeInput = z.infer<typeof UnsubscribeRequestSchema>;
export type PushSubscriptionResponse = z.infer<
  typeof PushSubscriptionResponseSchema
>;
