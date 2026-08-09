import { randomUUID } from "crypto";
import type { PrismaClient, Prisma } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";
import type {
  TransactionType,
  TransactionStatus,
  PaymentMethod,
} from "./transaction.model";

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
    return (tx ?? prisma).transaction.create({
      data: {
        ...data,
        internalTxNumber: data.internalTxNumber ?? randomUUID(),
      },
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
    return (tx ?? prisma).transaction.update({
      where: { id },
      data: { status },
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
    return (tx ?? prisma).transaction.update({
      where: { id },
      data: {
        status,
        ...(data.externalRef !== undefined
          ? { externalRef: data.externalRef }
          : {}),
        ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
      },
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
    return (tx ?? prisma).transaction.update({
      where: { id },
      data: {
        ...(data.externalRef !== undefined
          ? { externalRef: data.externalRef }
          : {}),
        ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
      },
    });
  }
}

export const transactionRepository = new TransactionRepository();
