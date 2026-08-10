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
