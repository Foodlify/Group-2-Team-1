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
import { extractDetails } from "./transaction.details";

export class TransactionRepository extends BaseRepository<
  PrismaClient["transaction"]
> {
  constructor() {
    super(prisma.transaction);
  }

  async findById(id: string) {
    return this.findUnique({ where: { id } });
  }

  async findByIdWithDetails(id: string) {
    return prisma.transaction.findUnique({
      where: { id },
      include: { details: true },
    });
  }

  async findByOrderId(orderId: string, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).transaction.findMany({
      where: { orderId },
      orderBy: { createdAt: "desc" },
      include: { details: true },
    });
  }

  async findByExternalRef(externalRef: string) {
    return prisma.transaction.findFirst({ where: { externalRef } });
  }

  async findPage(
    where: Prisma.TransactionWhereInput,
    skip: number,
    take: number,
    withDetails = false,
  ) {
    const [rows, total] = await prisma.$transaction([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,

        ...(withDetails ? { include: { details: true } } : {}),
      }),
      prisma.transaction.count({ where }),
    ]);
    return { rows, total };
  }

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

  private async writeDetails(
    transactionId: string,
    metadata: unknown,
    client: Prisma.TransactionClient,
  ): Promise<void> {
    const fields = extractDetails(metadata);
    if (!fields) return;
    await client.transactionDetails.upsert({
      where: { transactionId },
      create: { ...fields, transactionId },
      update: fields,
    });
  }

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

      await this.writeDetails(created.id, data.metadata, client);
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
      await this.writeDetails(id, data.metadata, client);
      return {
        result: updated,

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
      await this.writeDetails(id, data.metadata, client);
      return {
        result: updated,

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
