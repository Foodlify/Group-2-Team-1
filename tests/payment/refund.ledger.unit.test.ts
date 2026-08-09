/**
 * The refund ledger — what `refundOrderTransactions` writes when an order is
 * cancelled.
 *
 * This runs inside the cancelling database transaction, so it must not touch a
 * gateway. Its job is to record intent honestly and hand back the work: a
 * gateway refund is written PENDING because no money has moved yet, and the
 * row is returned so the caller can execute it after the commit.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/transaction/transaction.repository", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/modules/transaction/transaction.repository")
  >("../../src/modules/transaction/transaction.repository");
  return {
    transactionRepository: {
      findByOrderId: vi.fn(),
      createTransaction: vi.fn(),
      updateStatus: vi.fn(),
      findMany: vi.fn(),
    },
    // The class is kept real: `generateRefundTxNumber` is a pure static used
    // by the code under test.
    TransactionRepository: actual.TransactionRepository,
  };
});

import { transactionService } from "../../src/modules/transaction/transaction.service";
import { transactionRepository } from "../../src/modules/transaction/transaction.repository";

const mockedRepo = vi.mocked(transactionRepository);
const tx = { __brand: "tx" } as never;

const paymentRow = (over: Record<string, unknown> = {}) => ({
  id: "txn_1",
  type: "ORDER_PAYMENT",
  status: "SUCCESS",
  paymentMethod: "CREDIT_CARD",
  currency: "EGP",
  amount: 60,
  orderId: "order_1",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockedRepo.createTransaction.mockImplementation(
    async (data: { status: string }) =>
      ({ id: "txn_refund_1", ...data }) as never,
  );
});

describe("a card payment produces a refund that is not yet money returned", () => {
  beforeEach(() => {
    mockedRepo.findByOrderId.mockResolvedValue([paymentRow()] as never);
  });

  it("writes the REFUND row as PENDING, never SUCCESS", async () => {
    await transactionService.refundOrderTransactions("order_1", tx);

    // The gateway has not been called yet — it cannot be, this is inside the
    // database transaction. A SUCCESS here is a ledger that lies.
    expect(mockedRepo.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ type: "REFUND", status: "PENDING" }),
      tx,
    );
  });

  it("returns the row so the caller can execute it after the commit", async () => {
    const pending = await transactionService.refundOrderTransactions(
      "order_1",
      tx,
    );

    expect(pending).toHaveLength(1);
    expect(pending[0]!.refund.id).toBe("txn_refund_1");
    expect(pending[0]!.payment.id).toBe("txn_1");
  });

  it("refunds the amount and currency that were actually taken", async () => {
    await transactionService.refundOrderTransactions("order_1", tx);

    expect(mockedRepo.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 60, currency: "EGP" }),
      tx,
    );
  });

  it("writes everything on the caller's transaction client", async () => {
    await transactionService.refundOrderTransactions("order_1", tx);

    expect(mockedRepo.createTransaction).toHaveBeenCalledWith(
      expect.anything(),
      tx,
    );
  });
});

describe("cash needs no gateway, so nothing is handed back", () => {
  it("marks a cash refund SUCCESS immediately", async () => {
    mockedRepo.findByOrderId.mockResolvedValue([
      paymentRow({ paymentMethod: "CASH" }),
    ] as never);

    const pending = await transactionService.refundOrderTransactions(
      "order_1",
      tx,
    );

    // There is no provider to call, so the ledger entry IS the whole action.
    expect(mockedRepo.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ status: "SUCCESS" }),
      tx,
    );
    expect(pending).toEqual([]);
  });
});

describe("a payment that never succeeded is failed, not refunded", () => {
  it("marks a PENDING payment FAILED and creates no refund", async () => {
    mockedRepo.findByOrderId.mockResolvedValue([
      paymentRow({ status: "PENDING" }),
    ] as never);

    const pending = await transactionService.refundOrderTransactions(
      "order_1",
      tx,
    );

    // Refunding money that was never taken would invent a credit.
    expect(mockedRepo.updateStatus).toHaveBeenCalledWith("txn_1", "FAILED", tx);
    expect(mockedRepo.createTransaction).not.toHaveBeenCalled();
    expect(pending).toEqual([]);
  });
});

describe("finding refunds that are still owed", () => {
  beforeEach(() => {
    mockedRepo.findMany.mockResolvedValue([] as never);
  });

  it("looks for FAILED *and* PENDING refunds", async () => {
    await transactionService.findOutstandingRefunds();

    // A refund stuck PENDING for days is an unpaid obligation just as much as
    // a failed one. Listing only failures hides it from whoever is chasing
    // money the business owes.
    expect(mockedRepo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { type: "REFUND", status: { in: ["FAILED", "PENDING"] } },
      }),
    );
  });

  it("returns the oldest first", async () => {
    await transactionService.findOutstandingRefunds();

    // Whatever has been owed longest is what needs chasing first.
    expect(mockedRepo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "asc" } }),
    );
  });

  it("caps the result set", async () => {
    await transactionService.findOutstandingRefunds(25);

    expect(mockedRepo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 25 }),
    );
  });
});

describe("finding the payment a refund draws on", () => {
  it("picks the successful order payment", async () => {
    mockedRepo.findByOrderId.mockResolvedValue([
      paymentRow({ id: "failed_attempt", status: "FAILED" }),
      paymentRow({ id: "the_real_one", status: "SUCCESS" }),
    ] as never);

    const payment = await transactionService.findPaymentForRefund({
      orderId: "order_1",
    } as never);

    // Refunding against a failed payment would try to return money that never
    // arrived.
    expect(payment?.id).toBe("the_real_one");
  });

  it("returns null when nothing on the order ever succeeded", async () => {
    mockedRepo.findByOrderId.mockResolvedValue([
      paymentRow({ status: "PENDING" }),
    ] as never);

    const payment = await transactionService.findPaymentForRefund({
      orderId: "order_1",
    } as never);

    expect(payment).toBeNull();
  });

  it("does not mistake another refund for the payment", async () => {
    mockedRepo.findByOrderId.mockResolvedValue([
      paymentRow({ id: "old_refund", type: "REFUND", status: "SUCCESS" }),
    ] as never);

    const payment = await transactionService.findPaymentForRefund({
      orderId: "order_1",
    } as never);

    expect(payment).toBeNull();
  });

  it("returns null for a refund with no order", async () => {
    const payment = await transactionService.findPaymentForRefund({
      orderId: null,
    } as never);

    expect(payment).toBeNull();
    expect(mockedRepo.findByOrderId).not.toHaveBeenCalled();
  });
});

describe("mixed transactions on one order", () => {
  it("handles each by its own state", async () => {
    mockedRepo.findByOrderId.mockResolvedValue([
      paymentRow({ id: "paid", status: "SUCCESS" }),
      paymentRow({ id: "never_paid", status: "PENDING" }),
    ] as never);

    const pending = await transactionService.refundOrderTransactions(
      "order_1",
      tx,
    );

    expect(mockedRepo.updateStatus).toHaveBeenCalledWith(
      "never_paid",
      "FAILED",
      tx,
    );
    expect(mockedRepo.createTransaction).toHaveBeenCalledTimes(1);
    expect(pending).toHaveLength(1);
    expect(pending[0]!.payment.id).toBe("paid");
  });
});
