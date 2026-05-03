import type { PrismaClient, Prisma } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";

export class TransactionRepository extends BaseRepository<PrismaClient["transaction"]> {
  constructor() {
    super(prisma.transaction);
  }

  async findById(id: string) {
    return this.findUnique({ where: { id } });
  }

  async findByOrderId(orderId: string) {
    return this.findUnique({ where: { orderId } });
  }

  async createTransaction(
    data: {
      orderId: string;
      paymentMethod: string;
      status: string;
      referenceNumber?: string | null;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return (tx ?? prisma).transaction.create({ data });
  }
}

export const transactionRepository = new TransactionRepository();
