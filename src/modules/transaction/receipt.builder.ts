import { Prisma } from "../../generated/prisma/client";
import type { ReceiptResponse } from "./transaction.validation";

/** What `findForReceipt` returns — the row plus everything a receipt states. */
type ReceiptSource = NonNullable<
  Awaited<
    ReturnType<
      typeof import("./transaction.repository").transactionRepository.findForReceipt
    >
  >
>;

/**
 * Builds a receipt from a settled transaction.
 *
 * Two rules hold this together.
 *
 * **Everything is read from the order's own snapshots.** `OrderItems` carries
 * the name and price as they were at checkout, and `Order.totalAmount` is
 * frozen there too. A receipt rebuilt from the live catalog would quietly
 * restate history every time a restaurant edits a price — the document has to
 * say what the customer actually paid.
 *
 * **The arithmetic stays in `Decimal` to the last step.** Line totals are
 * `price × quantity` summed across items, and doing that in JS `number` is the
 * bug this codebase has already fixed twice — `8.15 × 3` served
 * `24.450000000000003`. `Number()` is called once, at the response boundary,
 * and never before.
 */
export const buildReceipt = (
  transaction: ReceiptSource,
  issuedAt: Date,
): ReceiptResponse => {
  const order = transaction.order;
  if (!order) {
    throw new Error("buildReceipt requires a transaction attached to an order");
  }

  const items = order.orderItems.map((item) => {
    const lineTotal = new Prisma.Decimal(item.price).times(item.quantity);
    return {
      name: item.name,
      quantity: item.quantity,
      unitPrice: Number(item.price),
      lineTotal: Number(lineTotal),
    };
  });

  const itemsTotal = order.orderItems.reduce(
    (sum, item) =>
      sum.plus(new Prisma.Decimal(item.price).times(item.quantity)),
    new Prisma.Decimal(0),
  );

  return {
    // The receipt's own reference is the internal transaction number, which is
    // unique and already printed on nothing else — the gateway's reference is
    // reported separately because it identifies the charge, not the document.
    receiptNumber: transaction.internalTxNumber,
    issuedAt: issuedAt.toISOString(),
    transaction: {
      id: transaction.id,
      type: transaction.type,
      status: transaction.status,
      paymentMethod: transaction.paymentMethod,
      amount: Number(transaction.amount),
      currency: transaction.currency,
      externalRef: transaction.externalRef,
      settledAt: transaction.updatedAt.toISOString(),
    },
    order: {
      id: order.id,
      status: order.status,
      orderedAt: order.orderDate.toISOString(),
      restaurant: order.restaurant.name,
      // Snapshot total, not a recomputation: if these ever disagree the
      // receipt should show the order's own figure and the difference should
      // be visible rather than smoothed over.
      orderTotal: Number(order.totalAmount),
      itemsTotal: Number(itemsTotal),
    },
    customer: {
      name: order.customer.user.name,
      email: order.customer.user.email,
      phone: order.customer.phone,
    },
    deliveryAddress: [
      order.address.addressLine1,
      order.address.addressLine2,
      order.address.city,
      order.address.postalCode,
      order.address.country,
    ]
      .filter((part): part is string => Boolean(part))
      .join(", "),
    items,
  };
};
