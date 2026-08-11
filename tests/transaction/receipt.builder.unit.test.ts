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

    expect(receipt.order.itemsTotal).toBe(24.95);
  });

  it("reports the order's frozen total alongside the computed one", () => {
    const receipt = buildReceipt(source(), ISSUED_AT);

    expect(receipt.order.orderTotal).toBe(24.45);
    expect(receipt.order.itemsTotal).toBe(24.45);
  });
});

describe("what the document says", () => {
  it("uses the internal transaction number as the receipt reference", () => {
    const receipt = buildReceipt(source(), ISSUED_AT);

    expect(receipt.receiptNumber).toBe("TXN-0001");
    expect(receipt.transaction.externalRef).toBe("pi_123");
  });

  it("itemises the names and prices recorded at order time", () => {
    const receipt = buildReceipt(source(), ISSUED_AT);

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

    expect(receipt.deliveryAddress).not.toContain(", ,");
  });

  it("stamps when it was generated, separately from when the money moved", () => {
    const receipt = buildReceipt(source(), ISSUED_AT);

    expect(receipt.issuedAt).toBe("2026-08-10T12:00:00.000Z");
    expect(receipt.transaction.settledAt).toBe("2026-08-01T09:30:00.000Z");
  });

  it("refuses to build one without an order", () => {
    expect(() => buildReceipt(source({ order: null }), ISSUED_AT)).toThrow();
  });
});
