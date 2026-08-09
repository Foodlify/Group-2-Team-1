import type { Prisma } from "../../generated/prisma/client";
import {
  transactionRepository,
  TransactionRepository,
} from "./transaction.repository";
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

  /**
   * The one still-open gateway payment for an order, or null.
   *
   * `CASH` is excluded because it has no gateway to hear back from — its
   * PENDING row is settled by delivery, not by a callback. Returning null when
   * nothing is pending is what makes webhook handling idempotent: a redelivered
   * event finds the payment already settled and stops.
   */
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

  /**
   * Settles cash-on-delivery payments for a delivered order — marks their
   * PENDING transaction SUCCESS once the courier has collected the money.
   * Called when order status transitions to DELIVERED.
   *
   * Scoped to CASH on purpose: gateway-backed payments (card, wallet) settle
   * via their own success/webhook flow, never by a delivery status change —
   * marking a stuck-PENDING online payment SUCCESS here would claim funds
   * that were never actually received.
   */
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

  /**
   * Reconciles an order's transactions when it is cancelled: issues a
   * matching REFUND for every successful payment, and marks any
   * still-pending payment as FAILED. Runs inside the caller's transaction.
   */
  async refundOrderTransactions(
    orderId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const txs = await transactionRepository.findByOrderId(orderId, tx);
    for (const t of txs) {
      if (t.status === "SUCCESS") {
        await transactionRepository.createTransaction(
          {
            type: "REFUND",
            amount: Number(t.amount),
            currency: t.currency,
            status: "SUCCESS",
            paymentMethod: t.paymentMethod,
            orderId,
            internalTxNumber:
              TransactionRepository.generateRefundTxNumber(orderId),
          },
          tx,
        );
      } else {
        await transactionRepository.updateStatus(t.id, "FAILED", tx);
      }
    }
  }
}

export const transactionService = new TransactionService();
