import logger from "../../config/logger";
import { AppError } from "../../middlewares/error.middleware";
import { pushErrors } from "../../shared/exceptions/push.errors";
import { pushTransport } from "../../shared/push/push.transport";
import { pushRepository } from "./push.repository";
import type {
  PushSubscriptionInput,
  PushSubscriptionResponse,
} from "./push.validation";

/** What a browser is told when an order changes. Kept small on purpose — a */
/** push payload has a hard size limit, and the client re-fetches the order. */
export interface PushMessage {
  title: string;
  body: string;
  orderId: string;
}

class PushService {
  /**
   * The key a browser needs before it can subscribe.
   *
   * 404 rather than an empty string when push is off: a client that receives
   * "" would call `subscribe()` with it and fail deep inside the browser with
   * an error nobody can act on.
   */
  publicKey(): string {
    const key = pushTransport.publicKey;
    if (!key) {
      throw new AppError(
        pushErrors.PUSH_NOT_CONFIGURED.message,
        pushErrors.PUSH_NOT_CONFIGURED.statusCode,
      );
    }
    return key;
  }

  async subscribe(
    customerId: string,
    input: PushSubscriptionInput,
    userAgent?: string,
  ): Promise<PushSubscriptionResponse> {
    const row = await pushRepository.upsertSubscription({
      customerId,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent,
    });
    return this.toResponse(row);
  }

  async unsubscribe(customerId: string, endpoint: string): Promise<void> {
    const removed = await pushRepository.deleteForCustomer(
      customerId,
      endpoint,
    );
    if (!removed) {
      throw new AppError(
        pushErrors.SUBSCRIPTION_NOT_FOUND.message,
        pushErrors.SUBSCRIPTION_NOT_FOUND.statusCode,
      );
    }
  }

  async listMine(customerId: string): Promise<PushSubscriptionResponse[]> {
    const rows = await pushRepository.findByCustomerId(customerId);
    return rows.map((row) => this.toResponse(row));
  }

  /**
   * Pushes one message to every browser this customer has registered.
   *
   * Never throws — like the mailer, this is called after an order has already
   * committed, and a browser that has stopped listening is not a reason to fail
   * anything. The one thing it does act on is a `gone` verdict: those rows are
   * deleted, because a push service that says an endpoint no longer exists is
   * never going to change its mind, and keeping it means retrying a dead
   * address on every future order forever.
   */
  async notifyCustomer(
    customerId: string,
    message: PushMessage,
  ): Promise<void> {
    if (!pushTransport.isConfigured) return;

    const subscriptions = await pushRepository.findByCustomerId(customerId);
    if (subscriptions.length === 0) return;

    const outcomes = await Promise.all(
      subscriptions.map(async (row) => ({
        endpoint: row.endpoint,
        outcome: await pushTransport.send(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          message,
        ),
      })),
    );

    const gone = outcomes
      .filter((result) => result.outcome === "gone")
      .map((result) => result.endpoint);
    if (gone.length === 0) return;

    const removed = await pushRepository.deleteByEndpoints(gone);
    logger.info("Pruned push subscriptions the push service reported gone", {
      customerId,
      removed,
    });
  }

  /**
   * The keys never come back out. They are the browser's half of the payload
   * encryption, and a customer listing their devices has no use for them —
   * only somebody copying a subscription elsewhere would.
   */
  private toResponse(row: {
    id: string;
    endpoint: string;
    userAgent: string | null;
    createdAt: Date;
  }): PushSubscriptionResponse {
    return {
      id: row.id,
      endpoint: row.endpoint,
      userAgent: row.userAgent,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

export const pushService = new PushService();
