import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";

export class PushRepository extends BaseRepository<
  PrismaClient["pushSubscription"]
> {
  constructor() {
    super(prisma.pushSubscription);
  }

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

  async deleteForCustomer(
    customerId: string,
    endpoint: string,
  ): Promise<boolean> {
    const { count } = await prisma.pushSubscription.deleteMany({
      where: { customerId, endpoint },
    });
    return count > 0;
  }

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
