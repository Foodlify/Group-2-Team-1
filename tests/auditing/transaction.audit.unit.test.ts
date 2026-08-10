/**
 * What the audit trail records about a transaction.
 *
 * Two things can go wrong here and neither shows up as a failing request. The
 * payload can quietly carry the gateway's metadata blob into a table nothing
 * ever prunes, and money can go in as a JavaScript number and come back out
 * slightly different. Both look fine in a response body.
 */
import { describe, expect, it } from "vitest";
import { Prisma } from "../../src/generated/prisma/client";
import {
  auditCreated,
  auditGatewayReference,
  auditStatusChange,
} from "../../src/modules/transaction/transaction.audit";

const transaction = (over: Record<string, unknown> = {}) =>
  ({
    id: "txn_1",
    type: "ORDER_PAYMENT",
    status: "PENDING",
    paymentMethod: "CREDIT_CARD",
    amount: new Prisma.Decimal("24.45"),
    currency: "EGP",
    internalTxNumber: "TXN-0001",
    externalRef: "pi_123",
    orderId: "order_1",
    metadata: { card: { last4: "4242" }, providerBlob: "arbitrary" },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  }) as never;

describe("the payload for a newly created transaction", () => {
  it("records what an auditor needs to identify the money", () => {
    expect(auditCreated(transaction())).toEqual({
      type: "ORDER_PAYMENT",
      status: "PENDING",
      paymentMethod: "CREDIT_CARD",
      amount: "24.45",
      currency: "EGP",
      internalTxNumber: "TXN-0001",
      externalRef: "pi_123",
      orderId: "order_1",
    });
  });

  it("never copies the gateway's metadata blob", () => {
    const changes = auditCreated(transaction());

    // The provider decides that JSON's shape, not us. Spreading the write
    // payload — the obvious implementation — puts card details and whatever
    // else the gateway sends into permanent, append-only storage.
    expect(changes).not.toHaveProperty("metadata");
    expect(JSON.stringify(changes)).not.toContain("4242");
  });

  it("stringifies the amount instead of letting JSON round it", () => {
    const changes = auditCreated(
      transaction({ amount: new Prisma.Decimal("12345678901234567.89") }),
    );

    // Through a JS number this becomes 12345678901234568 — a different sum of
    // money, recorded permanently, in the one table that is supposed to settle
    // arguments about sums of money.
    expect(changes).toMatchObject({ amount: "12345678901234567.89" });
  });
});

describe("the payload for a status transition", () => {
  it("records both ends of it", () => {
    expect(auditStatusChange("PENDING", "SUCCESS")).toEqual({
      status: { from: "PENDING", to: "SUCCESS" },
    });
  });

  it("distinguishes a real settlement from a redelivered one", () => {
    // Stripe redelivers webhooks. `to: SUCCESS` alone reads identically in
    // both cases; only the `from` says whether money actually moved this time.
    expect(auditStatusChange("SUCCESS", "SUCCESS")).toEqual({
      status: { from: "SUCCESS", to: "SUCCESS" },
    });
  });

  it("says the previous state is unknown rather than inventing one", () => {
    expect(auditStatusChange(null, "FAILED")).toEqual({
      status: { from: null, to: "FAILED" },
    });
  });
});

describe("the payload for a gateway reference", () => {
  it("records the reference moving", () => {
    expect(auditGatewayReference(null, { externalRef: "pi_123" })).toEqual({
      externalRef: { from: null, to: "pi_123" },
    });
  });

  it("flags that metadata changed without copying it", () => {
    const changes = auditGatewayReference(null, {
      metadata: { card: { last4: "4242" } },
    });

    expect(changes).toEqual({ metadataReplaced: true });
    expect(JSON.stringify(changes)).not.toContain("4242");
  });

  it("omits a field the write never touched", () => {
    // An entry that reports `externalRef: { from: "pi_123", to: undefined }`
    // claims a change that did not happen.
    expect(
      auditGatewayReference("pi_123", { metadata: {} }),
    ).not.toHaveProperty("externalRef");
  });
});
