import { randomUUID } from "crypto";
import type { PrismaClient, Prisma } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";
import type {
  TransactionType,
  TransactionStatus,
  PaymentMethod,
} from "./transaction.model";
import {
  auditingRepository,
  type AuditableEvent,
} from "../auditing/auditing.repository";
import {
  auditCreated,
  auditGatewayReference,
  auditStatusChange,
} from "./transaction.audit";

export class TransactionRepository extends BaseRepository<
  PrismaClient["transaction"]
> {
  constructor() {
    super(prisma.transaction);
  }

  async findById(id: string) {
    return this.findUnique({ where: { id } });
  }

  async findByOrderId(orderId: string, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).transaction.findMany({
      where: { orderId },
      orderBy: { createdAt: "desc" },
    });
  }

  async findByExternalRef(externalRef: string) {
    return prisma.transaction.findFirst({ where: { externalRef } });
  }

  /**
   * One page of transactions, newest first, plus the total for the page meta.
   *
   * Both in a single `$transaction` so the count cannot describe a different
   * set than the rows — without it a payment landing between the two queries
   * gives a total that does not match what was returned.
   */
  async findPage(
    where: Prisma.TransactionWhereInput,
    skip: number,
    take: number,
  ) {
    const [rows, total] = await prisma.$transaction([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.transaction.count({ where }),
    ]);
    return { rows, total };
  }

  /**
   * A transaction with everything a receipt has to state: what was bought, at
   * what price, by whom, and to where. All of it read from the order's own
   * snapshots rather than from the live catalog — the receipt has to say what
   * the customer actually paid, not what the item costs today.
   */
  async findForReceipt(id: string) {
    return prisma.transaction.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            orderItems: true,
            restaurant: { select: { id: true, name: true } },
            address: true,
            customer: {
              select: {
                id: true,
                phone: true,
                user: { select: { name: true, email: true } },
              },
            },
          },
        },
      },
    });
  }

  /**
   * Every write below goes through here, which is the point: auditing sits at
   * the repository, not the service, so there is no path that can move a
   * transaction's state without leaving an entry — not a future service method,
   * not a script that reaches for the repository directly.
   *
   * The entry is written with the SAME client as the change, so the two commit
   * or roll back together. When the caller has no transaction of its own we
   * open one rather than writing the pair separately: "record it afterwards,
   * best effort" leaves precisely the gap the trail exists to close, and the
   * case where the audit write fails is exactly the case where you most want
   * the change undone.
   */
  private async audited<T>(
    tx: Prisma.TransactionClient | undefined,
    run: (
      client: Prisma.TransactionClient,
    ) => Promise<{ result: T; event: AuditableEvent }>,
  ): Promise<T> {
    const perform = async (client: Prisma.TransactionClient): Promise<T> => {
      const { result, event } = await run(client);
      await auditingRepository.record(event, client);
      return result;
    };
    return tx ? perform(tx) : prisma.$transaction(perform);
  }

  /**
   * Reads a transaction's audited fields while holding a row lock.
   *
   * The lock is what makes the recorded `from` value true. Without it two
   * concurrent updates — a redelivered webhook racing a refund, which does
   * happen — both read the same pre-change snapshot under MVCC, and the second
   * entry claims a previous state that was already gone. A trail that
   * misreports the transition is worse than no trail, because it is believed.
   */
  private async lockForAudit(id: string, client: Prisma.TransactionClient) {
    await client.$queryRaw`SELECT id FROM "Transaction" WHERE id = ${id} FOR UPDATE`;
    return client.transaction.findUnique({
      where: { id },
      select: { status: true, externalRef: true },
    });
  }

  async createTransaction(
    data: {
      type: TransactionType;
      amount: number;
      currency?: string;
      status: TransactionStatus;
      paymentMethod: PaymentMethod;
      internalTxNumber?: string;
      externalRef?: string;
      orderId?: string;
      metadata?: Prisma.InputJsonValue;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return this.audited(tx, async (client) => {
      const created = await client.transaction.create({
        data: {
          ...data,
          internalTxNumber: data.internalTxNumber ?? randomUUID(),
        },
      });
      return {
        result: created,
        event: {
          entity: "Transaction" as const,
          entityId: created.id,
          action: "CREATED" as const,
          changes: auditCreated(created),
        },
      };
    });
  }

  // Generates a human-readable internal transaction number for refunds
  static generateRefundTxNumber(orderId: string): string {
    return `REF-${orderId}-${Date.now()}`;
  }

  async updateStatus(
    id: string,
    status: TransactionStatus,
    tx?: Prisma.TransactionClient,
  ) {
    return this.audited(tx, async (client) => {
      const before = await this.lockForAudit(id, client);
      const updated = await client.transaction.update({
        where: { id },
        data: { status },
      });
      return {
        result: updated,
        event: {
          entity: "Transaction" as const,
          entityId: id,
          action: "STATUS_CHANGED" as const,
          changes: auditStatusChange(before?.status ?? null, status),
        },
      };
    });
  }

  /**
   * Status and gateway reference in one write — used when the provider has
   * actually answered, so both facts become true at the same instant. A
   * separate status update would leave a window where the ledger says a refund
   * succeeded but cannot say which refund.
   */
  async recordGatewayOutcome(
    id: string,
    status: TransactionStatus,
    data: { externalRef?: string; metadata?: Prisma.InputJsonValue },
    tx?: Prisma.TransactionClient,
  ) {
    return this.audited(tx, async (client) => {
      const before = await this.lockForAudit(id, client);
      const updated = await client.transaction.update({
        where: { id },
        data: {
          status,
          ...(data.externalRef !== undefined
            ? { externalRef: data.externalRef }
            : {}),
          ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
        },
      });
      return {
        result: updated,
        // STATUS_CHANGED rather than UPDATED: the reference moving is
        // incidental, the settlement is the event. Both facts go in `changes`.
        event: {
          entity: "Transaction" as const,
          entityId: id,
          action: "STATUS_CHANGED" as const,
          changes: {
            ...(auditStatusChange(before?.status ?? null, status) as object),
            ...(auditGatewayReference(
              before?.externalRef ?? null,
              data,
            ) as object),
          },
        },
      };
    });
  }

  /**
   * Records the gateway's own identifiers on an existing payment. Separate
   * from `updateStatus` on purpose: attaching a reference says only "the
   * hand-off happened", never that money moved.
   */
  async attachGatewayReference(
    id: string,
    data: { externalRef?: string; metadata?: Prisma.InputJsonValue },
    tx?: Prisma.TransactionClient,
  ) {
    return this.audited(tx, async (client) => {
      const before = await this.lockForAudit(id, client);
      const updated = await client.transaction.update({
        where: { id },
        data: {
          ...(data.externalRef !== undefined
            ? { externalRef: data.externalRef }
            : {}),
          ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
        },
      });
      return {
        result: updated,
        // UPDATED, not STATUS_CHANGED — attaching a reference says the hand-off
        // to the gateway happened, never that money moved. The distinction is
        // the same one this method's own docblock draws.
        event: {
          entity: "Transaction" as const,
          entityId: id,
          action: "UPDATED" as const,
          changes: auditGatewayReference(before?.externalRef ?? null, data),
        },
      };
    });
  }
}

export const transactionRepository = new TransactionRepository();
