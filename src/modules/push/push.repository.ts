import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";

export class PushRepository extends BaseRepository<
  PrismaClient["pushSubscription"]
> {
  constructor() {
    super(prisma.pushSubscription);
  }

  /**
   * Registers a browser, or refreshes the row it already has.
   *
   * An upsert on `endpoint`, not a create: browsers re-issue the same
   * subscription on every page load, and a service worker update can re-send it
   * at any time. Insert-only would either collide on the unique index or
   * duplicate the row, and a duplicate row means every notification arriving
   * twice on the same device.
   *
   * `customerId` is part of the update, so a shared or handed-down device
   * follows whoever subscribed last rather than pushing a stranger's orders to
   * the person now holding it.
   */
  async upsertSubscription(data: {
    customerId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    userAgent?: string;
  }) {
    return prisma.pushSubscription.upsert({
      where: { endpoint: data.endpoint },
      create: data,
      update: {
        customerId: data.customerId,
        p256dh: data.p256dh,
        auth: data.auth,
        userAgent: data.userAgent ?? null,
      },
    });
  }

  async findByCustomerId(customerId: string) {
    return prisma.pushSubscription.findMany({
      where: { customerId },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Removes a subscription that belongs to this customer.
   *
   * Scoped by `customerId` as well as `endpoint` so knowing (or guessing) an
   * endpoint is not enough to silence somebody else's notifications. Returns
   * whether anything was removed, so the caller can 404 honestly.
   */
  async deleteForCustomer(
    customerId: string,
    endpoint: string,
  ): Promise<boolean> {
    const { count } = await prisma.pushSubscription.deleteMany({
      where: { customerId, endpoint },
    });
    return count > 0;
  }

  /**
   * Drops subscriptions the push service has told us are gone. Unscoped by
   * customer on purpose: this is not a user action, it is the push service
   * reporting that an address no longer exists.
   */
  async deleteByEndpoints(
    endpoints: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    if (endpoints.length === 0) return 0;
    const { count } = await (tx ?? prisma).pushSubscription.deleteMany({
      where: { endpoint: { in: endpoints } },
    });
    return count;
  }
}

export const pushRepository = new PushRepository();
