import { afterAll, beforeEach, describe, expect, it } from "vitest";
import prisma from "../../src/config/prisma";
import { transactionRepository } from "../../src/modules/transaction/transaction.repository";
import { runWithContext } from "../../src/shared/context/request.context";
import {
  createCartWithItem,
  createCatalog,
  disconnect,
  resetDatabase,
} from "./helpers/db";
import { api, asCookie, createAccount } from "./helpers/http";

const readyToCheckout = async (suffix = "buyer") => {
  const { user, customer, token } = await createAccount("CUSTOMER", { suffix });
  const { restaurant, menuItem } = await createCatalog({ price: "8.15" });
  const address = await prisma.address.create({
    data: {
      customerId: customer!.id,
      addressLine1: "12 Test Street",
      city: "Cairo",
      postalCode: "11511",
      country: "EG",
      isDefault: true,
    },
  });
  await createCartWithItem(customer!.id, restaurant.id, menuItem, 3);
  return { user, customer: customer!, address, token, menuItem };
};

const checkout = async (token: string, addressId: string) => {
  const res = await api()
    .post("/api/v1/orders")
    .set("Cookie", asCookie(token))
    .send({ addressId, paymentMethod: "CASH" });
  expect(res.status).toBe(201);
  return res.body.data;
};

const deliver = async (adminToken: string, orderId: string) => {
  for (const status of [
    "CONFIRMED",
    "PREPARING",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
  ]) {
    const res = await api()
      .patch(`/api/v1/orders/${orderId}/status`)
      .set("Cookie", asCookie(adminToken))
      .send({ status });
    expect(res.status).toBe(200);
  }
};

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnect();
});

describe("what checkout leaves in the trail", () => {
  it("records the payment, attributed to the customer who made the request", async () => {
    const buyer = await readyToCheckout();

    await checkout(buyer.token, buyer.address.id);

    const [entry] = await prisma.auditingEvent.findMany();
    expect(entry).toMatchObject({
      entity: "Transaction",
      action: "CREATED",
      actorId: buyer.user.id,
      actorRole: "CUSTOMER",
      route: "POST /api/v1/orders",
    });

    expect(entry!.ip).toBeTruthy();
  });

  it("records the amount as a string, through a real Decimal column", async () => {
    const buyer = await readyToCheckout();

    await checkout(buyer.token, buyer.address.id);

    const [entry] = await prisma.auditingEvent.findMany();
    expect(entry!.changes).toMatchObject({ amount: "24.45" });
  });

  it("points at the transaction it describes", async () => {
    const buyer = await readyToCheckout();

    await checkout(buyer.token, buyer.address.id);

    const transaction = await prisma.transaction.findFirstOrThrow();
    const [entry] = await prisma.auditingEvent.findMany();
    expect(entry!.entityId).toBe(transaction.id);
  });
});

describe("what settling the payment leaves in the trail", () => {
  it("records the transition, attributed to the admin rather than the buyer", async () => {
    const buyer = await readyToCheckout();
    const { user: admin, token: adminToken } = await createAccount("ADMIN");
    const order = await checkout(buyer.token, buyer.address.id);

    await deliver(adminToken, order.id);

    const settlement = await prisma.auditingEvent.findFirstOrThrow({
      where: { action: "STATUS_CHANGED" },
    });

    expect(settlement).toMatchObject({
      actorId: admin.id,
      actorRole: "ADMIN",
      changes: { status: { from: "PENDING", to: "SUCCESS" } },
    });
  });

  it("builds a trail in order, not a single overwritten row", async () => {
    const buyer = await readyToCheckout();
    const { token: adminToken } = await createAccount("ADMIN");
    const order = await checkout(buyer.token, buyer.address.id);

    await deliver(adminToken, order.id);

    const trail = await prisma.auditingEvent.findMany({
      orderBy: { createdAt: "asc" },
    });
    expect(trail.map((e) => e.action)).toEqual(["CREATED", "STATUS_CHANGED"]);
  });
});

describe("the entry and the change commit together", () => {
  it("writes both when the caller has no transaction of its own", async () => {
    await transactionRepository.createTransaction({
      type: "ORDER_PAYMENT",
      amount: 10,
      status: "PENDING",
      paymentMethod: "CASH",
    });

    expect(await prisma.transaction.count()).toBe(1);
    expect(await prisma.auditingEvent.count()).toBe(1);
  });

  it("leaves neither when the caller's transaction rolls back", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await transactionRepository.createTransaction(
          {
            type: "ORDER_PAYMENT",
            amount: 10,
            status: "PENDING",
            paymentMethod: "CASH",
          },
          tx,
        );
        throw new Error("checkout failed after the payment row was written");
      }),
    ).rejects.toThrow();

    expect(await prisma.transaction.count()).toBe(0);
    expect(await prisma.auditingEvent.count()).toBe(0);
  });
});

describe("the gateway hand-off, kept separate from the money", () => {
  const pendingCardPayment = () =>
    transactionRepository.createTransaction({
      type: "ORDER_PAYMENT",
      amount: 10,
      status: "PENDING",
      paymentMethod: "CREDIT_CARD",
    });

  it("records attaching a reference as an update, not as a settlement", async () => {
    const payment = await pendingCardPayment();

    await transactionRepository.attachGatewayReference(payment.id, {
      externalRef: "pi_123",
    });

    const entry = await prisma.auditingEvent.findFirstOrThrow({
      where: { action: { not: "CREATED" } },
    });

    expect(entry.action).toBe("UPDATED");
    expect(entry.changes).toEqual({
      externalRef: { from: null, to: "pi_123" },
    });
  });

  it("records the gateway's answer as a settlement, with both facts", async () => {
    const payment = await pendingCardPayment();
    await transactionRepository.attachGatewayReference(payment.id, {
      externalRef: "pi_123",
    });

    await transactionRepository.recordGatewayOutcome(payment.id, "SUCCESS", {
      externalRef: "pi_456",
      metadata: { card: { last4: "4242" } },
    });

    const entry = await prisma.auditingEvent.findFirstOrThrow({
      where: { action: "STATUS_CHANGED" },
    });
    expect(entry.changes).toEqual({
      status: { from: "PENDING", to: "SUCCESS" },
      externalRef: { from: "pi_123", to: "pi_456" },
      metadataReplaced: true,
    });
  });

  it("keeps the provider's blob out of the trail entirely", async () => {
    const payment = await pendingCardPayment();
    await transactionRepository.recordGatewayOutcome(payment.id, "SUCCESS", {
      metadata: { card: { last4: "4242" }, raw: "whatever Stripe sent" },
    });

    const trail = await prisma.auditingEvent.findMany();
    expect(JSON.stringify(trail)).not.toContain("4242");
  });
});

describe("under concurrent writes to the same transaction", () => {
  it("records a chain of transitions rather than two claiming the same start", async () => {
    const created = await transactionRepository.createTransaction({
      type: "ORDER_PAYMENT",
      amount: 10,
      status: "PENDING",
      paymentMethod: "CASH",
    });

    await Promise.all([
      transactionRepository.updateStatus(created.id, "SUCCESS"),
      transactionRepository.updateStatus(created.id, "FAILED"),
    ]);

    const trail = await prisma.auditingEvent.findMany({
      where: { action: "STATUS_CHANGED" },
    });
    expect(trail).toHaveLength(2);

    const fromPending = trail.filter(
      (e) =>
        (e.changes as { status: { from: string } }).status.from === "PENDING",
    );
    expect(fromPending).toHaveLength(1);
  });
});

describe("what the trail outlives", () => {
  it("survives the account that wrote it", async () => {
    const buyer = await readyToCheckout();
    await checkout(buyer.token, buyer.address.id);

    await prisma.orderItems.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.order.deleteMany();
    await prisma.user.delete({ where: { id: buyer.user.id } });

    const [entry] = await prisma.auditingEvent.findMany();

    expect(entry?.actorId).toBe(buyer.user.id);
  });

  it("records no actor when nothing human was behind the write", async () => {
    await transactionRepository.createTransaction({
      type: "ORDER_PAYMENT",
      amount: 10,
      status: "PENDING",
      paymentMethod: "CASH",
    });

    const [entry] = await prisma.auditingEvent.findMany();
    expect(entry?.actorId).toBeNull();
    expect(entry?.actorRole).toBeNull();
  });

  it("attributes a write made inside a request context to that actor", async () => {
    await runWithContext(
      { actorId: "system_job", actorRole: "ADMIN", route: "POST /internal" },
      async () => {
        await transactionRepository.createTransaction({
          type: "ORDER_PAYMENT",
          amount: 10,
          status: "PENDING",
          paymentMethod: "CASH",
        });
      },
    );

    const [entry] = await prisma.auditingEvent.findMany();
    expect(entry).toMatchObject({
      actorId: "system_job",
      route: "POST /internal",
    });
  });
});

describe("reading the trail over HTTP", () => {
  const seedTrail = async () => {
    const buyer = await readyToCheckout();
    const { token: adminToken } = await createAccount("ADMIN");
    const order = await checkout(buyer.token, buyer.address.id);
    await deliver(adminToken, order.id);
    return { buyer, adminToken };
  };

  it("returns the entries to an admin, newest first", async () => {
    const { adminToken } = await seedTrail();

    const res = await api()
      .get("/api/v1/audit-events")
      .set("Cookie", asCookie(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].action).toBe("STATUS_CHANGED");
    expect(res.body.meta).toMatchObject({ page: 1, limit: 20, total: 2 });
  });

  it("filters down to one transaction's trail", async () => {
    const { adminToken } = await seedTrail();

    await transactionRepository.createTransaction({
      type: "ORDER_PAYMENT",
      amount: 5,
      status: "PENDING",
      paymentMethod: "CASH",
    });
    const transaction = await prisma.transaction.findFirstOrThrow({
      where: { amount: { not: 5 } },
    });

    const res = await api()
      .get(`/api/v1/audit-events?entityId=${transaction.id}`)
      .set("Cookie", asCookie(adminToken));

    expect(await prisma.auditingEvent.count()).toBe(3);
    expect(res.body.data).toHaveLength(2);
    expect(
      res.body.data.every(
        (e: { entityId: string }) => e.entityId === transaction.id,
      ),
    ).toBe(true);
  });

  it("filters by action", async () => {
    const { adminToken } = await seedTrail();

    const res = await api()
      .get("/api/v1/audit-events?action=STATUS_CHANGED")
      .set("Cookie", asCookie(adminToken));

    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(1);
  });

  it("403s a customer", async () => {
    const { buyer } = await seedTrail();

    const res = await api()
      .get("/api/v1/audit-events")
      .set("Cookie", asCookie(buyer.token));

    expect(res.status).toBe(403);
  });

  it("401s an anonymous caller", async () => {
    const res = await api().get("/api/v1/audit-events");
    expect(res.status).toBe(401);
  });

  it("400s an unknown entity rather than returning an empty page", async () => {
    const { adminToken } = await seedTrail();

    const res = await api()
      .get("/api/v1/audit-events?entity=Trasnaction")
      .set("Cookie", asCookie(adminToken));

    expect(res.status).toBe(400);
  });

  it("exposes no way to write to the trail", async () => {
    const { adminToken } = await seedTrail();

    for (const send of [
      api().post("/api/v1/audit-events"),
      api().delete("/api/v1/audit-events"),
    ]) {
      const res = await send.set("Cookie", asCookie(adminToken));
      expect(res.status).toBe(404);
    }
  });
});
