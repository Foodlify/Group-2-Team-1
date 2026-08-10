import webpush from "web-push";
import type { PushSubscription as WebPushSubscription } from "web-push";
import env from "../../config/env";
import logger from "../../config/logger";
import { describeError } from "../errors/describe";

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

  get publicKey(): string | null {
    return this.configured ? env.VAPID_PUBLIC_KEY! : null;
  }

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

      logger.error("Push delivery failed", {
        endpoint: subscription.endpoint,
        ...describeError(error),
      });
      return "failed";
    }
  }

  private isGone(error: unknown): boolean {
    const statusCode = (error as { statusCode?: unknown } | null)?.statusCode;
    return typeof statusCode === "number" && GONE_STATUS_CODES.has(statusCode);
  }
}

export const pushTransport = new PushTransport();
