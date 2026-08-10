/**
 * The receipt.
 *
 * A receipt is a financial document, so two things decide whether it is
 * trustworthy: the numbers add up exactly, and it describes the past rather
 * than the present. Both are easy to get wrong in ways that look fine — float
 * arithmetic reads correctly until a customer sees `24.450000000000003`, and
 * reading a name from the live catalog looks tidier right up until the
 * restaurant renames the dish.
 */
import { describe, expect, it } from "vitest";
import { Prisma } from "../../src/generated/prisma/client";
import { buildReceipt } from "../../src/modules/transaction/receipt.builder";

const ISSUED_AT = new Date("2026-08-10T12:00:00.000Z");
const ORDERED_AT = new Date("2026-08-01T09:30:00.000Z");

const source = (over: Record<string, unknown> = {}) =>
  ({
    id: "txn_1",
    type: "ORDER_PAYMENT",
    status: "SUCCESS",
    paymentMethod: "CREDIT_CARD",
    amount: new Prisma.Decimal("24.45"),
    currency: "EGP",
    internalTxNumber: "TXN-0001",
    externalRef: "pi_123",
    createdAt: ORDERED_AT,
    updatedAt: ORDERED_AT,
    order: {
      id: "order_1",
      status: "DELIVERED",
      orderDate: ORDERED_AT,
      totalAmount: new Prisma.Decimal("24.45"),
      customerId: "cust_1",
      restaurant: { id: "rest_1", name: "Koshary El Tahrir" },
      address: {
        addressLine1: "12 Test Street",
        addressLine2: null,
        city: "Cairo",
        postalCode: "11511",
        country: "EG",
      },
      customer: {
        id: "cust_1",
        phone: "01000000000",
        user: { name: "Jane Doe", email: "jane@example.com" },
      },
      orderItems: [
        {
          name: "Koshary",
          quantity: 3,
          price: new Prisma.Decimal("8.15"),
        },
      ],
    },
    ...over,
  }) as never;

describe("the arithmetic", () => {
  it("multiplies a line total exactly", () => {
    const receipt = buildReceipt(source(), ISSUED_AT);

    // 8.15 x 3 in JS floats is 24.450000000000003. This project has already
    // shipped that number once, in the order line subtotals.
    expect(receipt.items[0]!.lineTotal).toBe(24.45);
  });

  it("sums several lines exactly", () => {
    const receipt = buildReceipt(
      source({
        order: {
          ...(source() as unknown as { order: Record<string, unknown> }).order,
          orderItems: [
            { name: "A", quantity: 3, price: new Prisma.Decimal("8.15") },
            { name: "B", quantity: 3, price: new Prisma.Decimal("0.1") },
            { name: "C", quantity: 1, price: new Prisma.Decimal("0.2") },
          ],
        },
      }),
      ISSUED_AT,
    );

    // 24.45 + 0.30 + 0.20. Accumulating these as numbers drifts on the second
    // addition — 0.1 x 3 is 0.30000000000000004 before it is even added.
    expect(receipt.order.itemsTotal).toBe(24.95);
  });

  it("reports the order's frozen total alongside the computed one", () => {
    const receipt = buildReceipt(source(), ISSUED_AT);

    // Both are shown on purpose. They agree for anything placed through
    // checkout, and if they ever disagree the receipt should make that visible
    // rather than quietly pick one.
    expect(receipt.order.orderTotal).toBe(24.45);
    expect(receipt.order.itemsTotal).toBe(24.45);
  });
});

describe("what the document says", () => {
  it("uses the internal transaction number as the receipt reference", () => {
    const receipt = buildReceipt(source(), ISSUED_AT);

    // The gateway's reference identifies a charge, not this document.
    expect(receipt.receiptNumber).toBe("TXN-0001");
    expect(receipt.transaction.externalRef).toBe("pi_123");
  });

  it("itemises the names and prices recorded at order time", () => {
    const receipt = buildReceipt(source(), ISSUED_AT);

    // Read from OrderItems, which snapshots both at checkout — a receipt
    // rebuilt from the live catalog restates history whenever a price changes.
    expect(receipt.items).toEqual([
      { name: "Koshary", quantity: 3, unitPrice: 8.15, lineTotal: 24.45 },
    ]);
  });

  it("names the customer, restaurant and delivery address", () => {
    const receipt = buildReceipt(source(), ISSUED_AT);

    expect(receipt.customer).toEqual({
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "01000000000",
    });
    expect(receipt.order.restaurant).toBe("Koshary El Tahrir");
    expect(receipt.deliveryAddress).toBe("12 Test Street, Cairo, 11511, EG");
  });

  it("omits an absent address line rather than printing a gap", () => {
    const receipt = buildReceipt(source(), ISSUED_AT);

    // addressLine2 is null here; a naive join leaves ", , " in the middle of
    // an address that goes on a financial document.
    expect(receipt.deliveryAddress).not.toContain(", ,");
  });

  it("stamps when it was generated, separately from when the money moved", () => {
    const receipt = buildReceipt(source(), ISSUED_AT);

    // Receipts are rendered on demand and never stored, so "issued" and
    // "settled" are genuinely different facts.
    expect(receipt.issuedAt).toBe("2026-08-10T12:00:00.000Z");
    expect(receipt.transaction.settledAt).toBe("2026-08-01T09:30:00.000Z");
  });

  it("refuses to build one without an order", () => {
    // The caller checks this first and returns 409; this is the backstop that
    // keeps the builder from inventing an empty document.
    expect(() => buildReceipt(source({ order: null }), ISSUED_AT)).toThrow();
  });
});
