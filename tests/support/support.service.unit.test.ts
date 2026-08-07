/**
 * Support Service — unit tests.
 *
 * Repositories are mocked so each test asserts pure service logic —
 * "IF the repository returns X, THEN the service does Y" — with no database.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/support/support.repository", () => ({
  supportTicketRepository: {
    createWithAssignment: vi.fn(),
    findByRequestId: vi.fn(),
    findByCustomerId: vi.fn(),
    findPaginatedAll: vi.fn(),
    updateStatus: vi.fn(),
    resolve: vi.fn(),
  },
}));

vi.mock("../../src/modules/order/order.repository", () => ({
  orderRepository: {
    findById: vi.fn(),
  },
}));

import { supportService } from "../../src/modules/support/support.service";
import { supportTicketRepository } from "../../src/modules/support/support.repository";
import { orderRepository } from "../../src/modules/order/order.repository";
import { orderErrors } from "../../src/shared/exceptions/order.errors";
import { supportErrors } from "../../src/shared/exceptions/support.errors";

const mockedTickets = vi.mocked(supportTicketRepository);
const mockedOrders = vi.mocked(orderRepository);

type OrderRow = NonNullable<
  Awaited<ReturnType<typeof orderRepository.findById>>
>;

const now = new Date("2026-08-06T10:00:00.000Z");
const ticketRow = {
  id: "tkt_1",
  requestId: "TCK-ABCDEFGHJK",
  customerId: "cust_1",
  orderId: null,
  category: "ORDER_ISSUE" as const,
  priority: "MEDIUM" as const,
  status: "OPEN" as const,
  subject: "Order arrived cold",
  description: "40 minutes late and cold.",
  assignedAgentId: "agent_1",
  resolution: null,
  resolvedAt: null,
  createdAt: now,
  updatedAt: now,
};

const createInput = {
  category: "ORDER_ISSUE" as const,
  subject: "Order arrived cold",
  description: "40 minutes late and cold.",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("create", () => {
  it("creates a ticket with a TCK- reference and no order link", async () => {
    mockedTickets.createWithAssignment.mockResolvedValue(ticketRow);

    const result = await supportService.create("cust_1", createInput);

    expect(mockedOrders.findById).not.toHaveBeenCalled();
    const arg = mockedTickets.createWithAssignment.mock.calls[0]![0];
    expect(arg.requestId).toMatch(/^TCK-[A-Z0-9]{10}$/);
    expect(arg).toMatchObject({
      customerId: "cust_1",
      orderId: null,
      category: "ORDER_ISSUE",
    });
    expect(result.requestId).toBe("TCK-ABCDEFGHJK");
  });

  it("verifies order ownership when the ticket references an order", async () => {
    mockedOrders.findById.mockResolvedValue({
      id: "order_1",
      customerId: "cust_1",
    } as unknown as OrderRow);
    mockedTickets.createWithAssignment.mockResolvedValue({
      ...ticketRow,
      orderId: "order_1",
    });

    const result = await supportService.create("cust_1", {
      ...createInput,
      orderId: "order_1",
    });

    expect(result.orderId).toBe("order_1");
  });

  it("throws 404 when the referenced order belongs to another customer", async () => {
    mockedOrders.findById.mockResolvedValue({
      id: "order_1",
      customerId: "someone_else",
    } as unknown as OrderRow);

    await expect(
      supportService.create("cust_1", { ...createInput, orderId: "order_1" }),
    ).rejects.toMatchObject({
      statusCode: orderErrors.ORDER_NOT_FOUND.statusCode,
    });
    expect(mockedTickets.createWithAssignment).not.toHaveBeenCalled();
  });

  it("retries with a fresh reference on a requestId collision", async () => {
    mockedTickets.createWithAssignment
      .mockRejectedValueOnce({ code: "P2002" })
      .mockResolvedValue(ticketRow);

    await supportService.create("cust_1", createInput);

    expect(mockedTickets.createWithAssignment).toHaveBeenCalledTimes(2);
    const first =
      mockedTickets.createWithAssignment.mock.calls[0]![0].requestId;
    const second =
      mockedTickets.createWithAssignment.mock.calls[1]![0].requestId;
    expect(first).not.toBe(second);
  });
});

describe("getMineByRequestId", () => {
  it("returns my ticket", async () => {
    mockedTickets.findByRequestId.mockResolvedValue(ticketRow);

    const result = await supportService.getMineByRequestId(
      "cust_1",
      "TCK-ABCDEFGHJK",
    );

    expect(result.id).toBe("tkt_1");
  });

  it("treats a foreign requestId exactly like a missing one (404)", async () => {
    mockedTickets.findByRequestId.mockResolvedValue({
      ...ticketRow,
      customerId: "someone_else",
    });

    await expect(
      supportService.getMineByRequestId("cust_1", "TCK-ABCDEFGHJK"),
    ).rejects.toMatchObject({
      statusCode: supportErrors.TICKET_NOT_FOUND.statusCode,
    });
  });
});

describe("adminResolve", () => {
  it("resolves an open ticket and frees the assigned agent's slot", async () => {
    mockedTickets.findByRequestId.mockResolvedValue(ticketRow);
    mockedTickets.resolve.mockResolvedValue({
      ...ticketRow,
      status: "RESOLVED",
      resolution: "Refunded",
      resolvedAt: now,
    });

    const result = await supportService.adminResolve(
      "TCK-ABCDEFGHJK",
      "Refunded",
    );

    expect(mockedTickets.resolve).toHaveBeenCalledWith(
      "tkt_1",
      "Refunded",
      "agent_1",
    );
    expect(result.status).toBe("RESOLVED");
    expect(result.resolvedAt).toBe(now.toISOString());
  });

  it("rejects resolving an already-resolved ticket (409)", async () => {
    mockedTickets.findByRequestId.mockResolvedValue({
      ...ticketRow,
      status: "RESOLVED",
    });

    await expect(
      supportService.adminResolve("TCK-ABCDEFGHJK", "again"),
    ).rejects.toMatchObject({
      statusCode: supportErrors.TICKET_ALREADY_RESOLVED.statusCode,
    });
    expect(mockedTickets.resolve).not.toHaveBeenCalled();
  });

  it("throws 404 for an unknown requestId", async () => {
    mockedTickets.findByRequestId.mockResolvedValue(null);

    await expect(
      supportService.adminResolve("TCK-0000000000", "x"),
    ).rejects.toMatchObject({
      statusCode: supportErrors.TICKET_NOT_FOUND.statusCode,
    });
  });
});

describe("adminList", () => {
  it("passes the status filter through and maps rows", async () => {
    const meta = { page: 1, limit: 20, total: 1, totalPages: 1 };
    mockedTickets.findPaginatedAll.mockResolvedValue({
      data: [ticketRow],
      meta,
    });

    const result = await supportService.adminList({
      page: 1,
      limit: 20,
      status: "OPEN",
    });

    expect(mockedTickets.findPaginatedAll).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      status: "OPEN",
    });
    expect(result.tickets[0]).toMatchObject({ requestId: "TCK-ABCDEFGHJK" });
    expect(result.meta).toEqual(meta);
  });
});
