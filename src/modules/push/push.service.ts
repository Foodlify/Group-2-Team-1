import logger from "../../config/logger";
import { AppError } from "../../middlewares/error.middleware";
import { pushErrors } from "../../shared/exceptions/push.errors";
import { pushTransport } from "../../shared/push/push.transport";
import { pushRepository } from "./push.repository";
import type {
  PushSubscriptionInput,
  PushSubscriptionResponse,
} from "./push.validation";

export interface PushMessage {
  title: string;
  body: string;
  orderId: string;
}

class PushService {
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
