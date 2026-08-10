import type { Prisma } from "../../generated/prisma/client";
import {
  transactionRepository,
  TransactionRepository,
} from "./transaction.repository";
import type {
  TransactionModel,
  TransactionDetailsModel,
} from "../../generated/prisma/models";
import type {
  TransactionType,
  TransactionStatus,
  PaymentMethod,
} from "./transaction.model";

export type TransactionWithDetails = TransactionModel & {
  details: TransactionDetailsModel | null;
};

export interface PendingGatewayRefund {
  refund: TransactionModel;
  payment: TransactionModel;
}

export interface TransactionListQuery {
  page: number;
  limit: number;
  type?: TransactionType;
  status?: TransactionStatus;
  orderId?: string;
}

class TransactionService {
  async findById(id: string) {
    return transactionRepository.findById(id);
  }

  async listForCustomer(customerId: string, query: TransactionListQuery) {
    return this.list({ ...query, customerId });
  }

  async listAll(query: TransactionListQuery) {
    return this.list(query, true) as Promise<{
      rows: TransactionWithDetails[];
      total: number;
    }>;
  }

  private async list(
    query: TransactionListQuery & { customerId?: string },
    withDetails = false,
  ): Promise<{ rows: TransactionModel[]; total: number }> {
    const where: Prisma.TransactionWhereInput = {
      ...(query.customerId ? { order: { customerId: query.customerId } } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.orderId ? { orderId: query.orderId } : {}),
    };
    return transactionRepository.findPage(
      where,
      (query.page - 1) * query.limit,
      query.limit,
      withDetails,
    );
  }

  async findReceiptSource(id: string, customerId?: string) {
    const transaction = await transactionRepository.findForReceipt(id);
    if (!transaction) return null;
    if (customerId && transaction.order?.customerId !== customerId) return null;
    return transaction;
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
      internalTxNumber?: string;
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

  async attachGatewayReference(
    id: string,
    data: { externalRef?: string; metadata?: Prisma.InputJsonValue },
    tx?: Prisma.TransactionClient,
  ) {
    return transactionRepository.attachGatewayReference(id, data, tx);
  }

  async findPendingGatewayPayment(
    orderId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const txs = await transactionRepository.findByOrderId(orderId, tx);
    return (
      txs.find(
        (t) =>
          t.type === "ORDER_PAYMENT" &&
          t.status === "PENDING" &&
          t.paymentMethod !== "CASH",
      ) ?? null
    );
  }

  async settleOrderTransactions(
    orderId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const txs = await transactionRepository.findByOrderId(orderId, tx);
    for (const t of txs) {
      if (t.status === "PENDING" && t.paymentMethod === "CASH") {
        await transactionRepository.updateStatus(t.id, "SUCCESS", tx);
      }
    }
  }

  async refundOrderTransactions(
    orderId: string,
    tx: Prisma.TransactionClient,
  ): Promise<PendingGatewayRefund[]> {
    const txs = await transactionRepository.findByOrderId(orderId, tx);
    const pending: PendingGatewayRefund[] = [];

    for (const t of txs) {
      if (t.status !== "SUCCESS") {
        await transactionRepository.updateStatus(t.id, "FAILED", tx);
        continue;
      }

      const viaGateway = t.paymentMethod !== "CASH";
      const refund = await transactionRepository.createTransaction(
        {
          type: "REFUND",
          amount: Number(t.amount),
          currency: t.currency,
          status: viaGateway ? "PENDING" : "SUCCESS",
          paymentMethod: t.paymentMethod,
          orderId,
          internalTxNumber:
            TransactionRepository.generateRefundTxNumber(orderId),
        },
        tx,
      );

      if (viaGateway) pending.push({ refund, payment: t });
    }

    return pending;
  }

  async findOutstandingRefunds(limit = 100) {
    return transactionRepository.findMany({
      where: { type: "REFUND", status: { in: ["FAILED", "PENDING"] } },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
  }

  async findPaymentForRefund(refund: TransactionModel) {
    if (!refund.orderId) return null;
    const txs = await transactionRepository.findByOrderId(refund.orderId);
    return (
      txs.find((t) => t.type === "ORDER_PAYMENT" && t.status === "SUCCESS") ??
      null
    );
  }

  async recordGatewayOutcome(
    id: string,
    status: TransactionStatus,
    data: { externalRef?: string; metadata?: Prisma.InputJsonValue },
    tx?: Prisma.TransactionClient,
  ) {
    return transactionRepository.recordGatewayOutcome(id, status, data, tx);
  }
}

export const transactionService = new TransactionService();
