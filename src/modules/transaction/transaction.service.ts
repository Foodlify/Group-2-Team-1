import type { Prisma } from "../../generated/prisma/client";
import {
  transactionRepository,
  TransactionRepository,
} from "./transaction.repository";
import type { TransactionModel } from "../../generated/prisma/models";
import type {
  TransactionType,
  TransactionStatus,
  PaymentMethod,
} from "./transaction.model";

/** A REFUND row awaiting execution against the gateway that took the money. */
export interface PendingGatewayRefund {
  refund: TransactionModel;
  payment: TransactionModel;
}

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
   *
   * A gateway-backed refund is written as **PENDING**, not SUCCESS: the money
   * has not moved until the provider says so, and a ledger that claims
   * otherwise is simply wrong. Returns those rows so the caller can execute
   * them against the gateway once the transaction has committed — the network
   * call must not happen in here.
   *
   * Cash refunds stay SUCCESS: there is no gateway to call, so the ledger
   * entry is the whole of the action.
   */
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

  /**
   * Refunds that have not reached the customer: `FAILED` ones the gateway
   * rejected, and `PENDING` ones we never heard back about.
   *
   * Both are unsettled obligations, which is why they are returned together —
   * a PENDING refund that has been sitting for days is as much a problem as a
   * failed one, and listing only failures would hide it.
   */
  async findOutstandingRefunds(limit = 100) {
    return transactionRepository.findMany({
      where: { type: "REFUND", status: { in: ["FAILED", "PENDING"] } },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
  }

  /**
   * The payment a refund is returning money from — the SUCCESS `ORDER_PAYMENT`
   * on the same order. Needed to reach the gateway reference, which lives on
   * the payment and not on the refund.
   */
  async findPaymentForRefund(refund: TransactionModel) {
    if (!refund.orderId) return null;
    const txs = await transactionRepository.findByOrderId(refund.orderId);
    return (
      txs.find((t) => t.type === "ORDER_PAYMENT" && t.status === "SUCCESS") ??
      null
    );
  }

  /**
   * Records a gateway's answer on a payment or a refund: the resulting state
   * plus the provider's own reference and metadata, in a single write.
   */
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
