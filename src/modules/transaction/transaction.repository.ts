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
}

export const transactionRepository = new TransactionRepository();
