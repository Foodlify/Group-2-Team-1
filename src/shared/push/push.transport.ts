import webpush from "web-push";
import type { PushSubscription as WebPushSubscription } from "web-push";
import env from "../../config/env";
import logger from "../../config/logger";
import { describeError } from "../errors/describe";

/**
 * Thin wrapper around `web-push`, so services never touch VAPID or encryption.
 *
 * Deliberately mirrors the mailer: configured or not, the rest of the system
 * behaves the same. Unset keys mean push is off — no route disappears and no
 * order fails, the sends simply become no-ops. It follows the same
 * "configure it or it doesn't exist" rule as the mailer, the cache and Stripe.
 *
 * There is no account behind any of this. VAPID is a key pair we generate
 * ourselves; the push goes straight to the endpoint the browser gave us, on its
 * own vendor's service.
 */

/**
 * What the push service says when a subscription is no longer real.
 *
 * 404 — the endpoint never existed or was rotated.
 * 410 Gone — the browser unsubscribed, was cleared, or the app was uninstalled.
 *
 * Both are permanent, and both are the *normal* end of a subscription's life
 * rather than an error: browsers expire them routinely. A sender that treats
 * them as transient keeps a table of addresses that can never receive anything
 * and re-attempts every one of them on every order, forever.
 */
const GONE_STATUS_CODES = new Set([404, 410]);

export type PushOutcome = "sent" | "gone" | "failed" | "disabled";

class PushTransport {
  private readonly configured: boolean;

  constructor() {
    this.configured = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
    if (this.configured) {
      webpush.setVapidDetails(
        env.VAPID_SUBJECT,
        env.VAPID_PUBLIC_KEY!,
        env.VAPID_PRIVATE_KEY!,
      );
    }
  }

  get isConfigured(): boolean {
    return this.configured;
  }

  /**
   * The public half of the VAPID pair, which the browser needs before it can
   * subscribe. Public by design — it is what identifies our sends to the push
   * service, and it can only be used to *verify* them.
   */
  get publicKey(): string | null {
    return this.configured ? env.VAPID_PUBLIC_KEY! : null;
  }

  /**
   * Sends one payload to one browser and reports what happened, rather than
   * throwing. The caller's job is an order, not a notification: the outcome is
   * something to act on (prune the row) or to log, never something to fail on.
   */
  async send(
    subscription: WebPushSubscription,
    payload: unknown,
  ): Promise<PushOutcome> {
    if (!this.configured) return "disabled";

    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload));
      return "sent";
    } catch (error) {
      if (this.isGone(error)) return "gone";
      // Anything else — the push service being down, a network blip, a payload
      // too large — is transient or ours to fix, and the subscription stays.
      logger.error("Push delivery failed", {
        endpoint: subscription.endpoint,
        ...describeError(error),
      });
      return "failed";
    }
  }

  /** `web-push` throws a `WebPushError` carrying the service's status code. */
  private isGone(error: unknown): boolean {
    const statusCode = (error as { statusCode?: unknown } | null)?.statusCode;
    return typeof statusCode === "number" && GONE_STATUS_CODES.has(statusCode);
  }
}

export const pushTransport = new PushTransport();
