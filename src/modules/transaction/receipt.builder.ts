import { Prisma } from "../../generated/prisma/client";
import type { ReceiptResponse } from "./transaction.validation";

type ReceiptSource = NonNullable<
  Awaited<
    ReturnType<
      typeof import("./transaction.repository").transactionRepository.findForReceipt
    >
  >
>;

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
