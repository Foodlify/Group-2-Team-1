import type { Prisma } from "../../generated/prisma/client";
import { transactionRepository } from "./transaction.repository";
import type {
  TransactionType,
  TransactionStatus,
  PaymentMethod,
} from "./transaction.model";

class TransactionService {
  async findById(id: string) {
    return transactionRepository.findById(id);
  }

  async findByOrderId(orderId: string) {
    return transactionRepository.findByOrderId(orderId);
  }

  async findByExternalRef(externalRef: string) {
    return transactionRepository.findByExternalRef(externalRef);
  }

  async createTransaction(
    input: {
      type: TransactionType;
      amount: number;
      currency?: string;
      status: TransactionStatus;
      paymentMethod: PaymentMethod;
      externalRef?: string;
      orderId?: string;
      metadata?: Prisma.InputJsonValue;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return transactionRepository.createTransaction(input, tx);
  }

  async updateStatus(
    id: string,
    status: TransactionStatus,
    tx?: Prisma.TransactionClient,
  ) {
    return transactionRepository.updateStatus(id, status, tx);
  }
}

export const transactionService = new TransactionService();
