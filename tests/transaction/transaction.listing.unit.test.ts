/**
 * Listing transactions, and who is allowed to see which.
 *
 * A transaction has no customer of its own — ownership runs through its order.
 * That indirection is the whole risk here: a filter that forgets it returns
 * the entire ledger to whoever asks, and the response looks perfectly normal.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/transaction/transaction.repository", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/modules/transaction/transaction.repository")
  >("../../src/modules/transaction/transaction.repository");
  return {
    transactionRepository: {
      findPage: vi.fn(),
      findForReceipt: vi.fn(),
    },
    TransactionRepository: actual.TransactionRepository,
  };
});

import { transactionService } from "../../src/modules/transaction/transaction.service";
import { transactionRepository } from "../../src/modules/transaction/transaction.repository";

const mockedRepo = vi.mocked(transactionRepository);

const query = { page: 1, limit: 20 };

beforeEach(() => {
  vi.clearAllMocks();
  mockedRepo.findPage.mockResolvedValue({ rows: [], total: 0 } as never);
});

describe("a customer's own transactions", () => {
  it("filters through the order's owner", async () => {
    await transactionService.listForCustomer("cust_1", query);

    // Not `where: {}` and not a customerId on the transaction itself — the
    // only link is the order relation.
    expect(mockedRepo.findPage).toHaveBeenCalledWith(
      expect.objectContaining({ order: { customerId: "cust_1" } }),
      0,
      20,
    );
  });

  it("keeps the owner filter when other filters are applied", async () => {
    await transactionService.listForCustomer("cust_1", {
      ...query,
      type: "REFUND",
      status: "SUCCESS",
    });

    // Spreading a filter object over the scope is exactly how the owner clause
    // gets dropped by accident.
    expect(mockedRepo.findPage).toHaveBeenCalledWith(
      {
        order: { customerId: "cust_1" },
        type: "REFUND",
        status: "SUCCESS",
      },
      0,
      20,
    );
  });

  it("translates the page number into an offset", async () => {
    await transactionService.listForCustomer("cust_1", { page: 3, limit: 20 });

    expect(mockedRepo.findPage).toHaveBeenCalledWith(expect.anything(), 40, 20);
  });
});

describe("the admin listing", () => {
  it("is not scoped to any customer", async () => {
    await transactionService.listAll(query);

    const [where] = mockedRepo.findPage.mock.calls[0]!;
    expect(where).not.toHaveProperty("order");
  });

  it("still applies the caller's filters", async () => {
    await transactionService.listAll({ ...query, orderId: "order_9" });

    expect(mockedRepo.findPage).toHaveBeenCalledWith(
      { orderId: "order_9" },
      0,
      20,
    );
  });
});

describe("fetching the row a receipt is built from", () => {
  const row = (customerId: string | null) =>
    ({
      id: "txn_1",
      status: "SUCCESS",
      order: customerId ? { customerId } : null,
    }) as never;

  it("returns it to its owner", async () => {
    mockedRepo.findForReceipt.mockResolvedValue(row("cust_1"));

    expect(
      await transactionService.findReceiptSource("txn_1", "cust_1"),
    ).not.toBeNull();
  });

  it("hides it from anyone else", async () => {
    mockedRepo.findForReceipt.mockResolvedValue(row("cust_1"));

    // Null rather than a distinct error: confirming the id exists is itself a
    // leak to someone who has no business knowing.
    expect(await transactionService.findReceiptSource("txn_1", "cust_2")).toBe(
      null,
    );
  });

  it("hides an order-less transaction from a customer", async () => {
    mockedRepo.findForReceipt.mockResolvedValue(row(null));

    // Nobody owns it, so no customer may read it.
    expect(await transactionService.findReceiptSource("txn_1", "cust_1")).toBe(
      null,
    );
  });

  it("returns it to an admin, who passes no customer", async () => {
    mockedRepo.findForReceipt.mockResolvedValue(row("cust_1"));

    expect(await transactionService.findReceiptSource("txn_1")).not.toBeNull();
  });

  it("returns null for an id that does not exist", async () => {
    mockedRepo.findForReceipt.mockResolvedValue(null);

    expect(await transactionService.findReceiptSource("nope", "cust_1")).toBe(
      null,
    );
  });
});
