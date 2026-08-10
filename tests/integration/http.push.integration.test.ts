import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../src/config/prisma";
import { notificationService } from "../../src/modules/notification/notification.service";
import { pushTransport } from "../../src/shared/push/push.transport";
import { disconnect, resetDatabase } from "./helpers/db";
import { api, asCookie, createAccount } from "./helpers/http";

const subscriptionBody = (endpoint: string) => ({
  endpoint,
  keys: { p256dh: "BNc-p256dh-public-key", auth: "auth-secret-value" },
});

const PHONE = "https://push.example/phone-endpoint";
const LAPTOP = "https://push.example/laptop-endpoint";

let customerToken: string;
let customerId: string;

beforeEach(async () => {
  await resetDatabase();
  vi.restoreAllMocks();
  const account = await createAccount("CUSTOMER", { suffix: "pushuser" });
  customerToken = account.token;
  customerId = account.customer!.id;
});

afterAll(async () => {
  await disconnect();
});

describe("the VAPID public key", () => {
  it("is served without a token, because a page needs it before login", async () => {
    const res = await api().get("/api/v1/push/public-key");

    expect(res.status).toBe(200);
    expect(res.body.data.publicKey).toBeTruthy();
  });

  it("is the key this deployment actually signs with", async () => {
    const res = await api().get("/api/v1/push/public-key");

    expect(res.body.data.publicKey).toBe(pushTransport.publicKey);
  });
});

describe("registering a browser", () => {
  it("stores the subscription and reports it back without the keys", async () => {
    const res = await api()
      .post("/api/v1/push/subscriptions")
      .set("Cookie", asCookie(customerToken))
      .set("User-Agent", "IntegrationBrowser/1.0")
      .send(subscriptionBody(PHONE));

    expect(res.status).toBe(201);
    expect(res.body.data.endpoint).toBe(PHONE);
    expect(res.body.data.userAgent).toBe("IntegrationBrowser/1.0");

    expect(JSON.stringify(res.body)).not.toContain("p256dh-public-key");
    expect(JSON.stringify(res.body)).not.toContain("auth-secret-value");
  });

  it("refreshes rather than duplicates when the same browser posts again", async () => {
    const send = () =>
      api()
        .post("/api/v1/push/subscriptions")
        .set("Cookie", asCookie(customerToken))
        .send(subscriptionBody(PHONE));

    await send();
    const second = await send();

    expect(second.status).toBe(201);
    expect(await prisma.pushSubscription.count()).toBe(1);
  });

  it("keeps a second device as its own row", async () => {
    for (const endpoint of [PHONE, LAPTOP]) {
      await api()
        .post("/api/v1/push/subscriptions")
        .set("Cookie", asCookie(customerToken))
        .send(subscriptionBody(endpoint));
    }

    const res = await api()
      .get("/api/v1/push/subscriptions")
      .set("Cookie", asCookie(customerToken));

    expect(res.body.data).toHaveLength(2);
  });

  it("moves a handed-down device to whoever subscribed last", async () => {
    const other = await createAccount("CUSTOMER", { suffix: "seconduser" });

    await api()
      .post("/api/v1/push/subscriptions")
      .set("Cookie", asCookie(customerToken))
      .send(subscriptionBody(PHONE));
    await api()
      .post("/api/v1/push/subscriptions")
      .set("Cookie", asCookie(other.token))
      .send(subscriptionBody(PHONE));

    const row = await prisma.pushSubscription.findUniqueOrThrow({
      where: { endpoint: PHONE },
    });
    expect(row.customerId).toBe(other.customer!.id);
    expect(await prisma.pushSubscription.count()).toBe(1);
  });

  it("401s an anonymous caller and 403s an admin", async () => {
    const { token: adminToken } = await createAccount("ADMIN");

    const anonymous = await api()
      .post("/api/v1/push/subscriptions")
      .send(subscriptionBody(PHONE));
    const admin = await api()
      .post("/api/v1/push/subscriptions")
      .set("Cookie", asCookie(adminToken))
      .send(subscriptionBody(PHONE));

    expect(anonymous.status).toBe(401);

    expect(admin.status).toBe(403);
  });

  it("400s a payload that is not a browser subscription", async () => {
    const res = await api()
      .post("/api/v1/push/subscriptions")
      .set("Cookie", asCookie(customerToken))
      .send({ endpoint: "not-a-url", keys: {} });

    expect(res.status).toBe(400);
    expect(await prisma.pushSubscription.count()).toBe(0);
  });
});

describe("removing a browser", () => {
  beforeEach(async () => {
    await api()
      .post("/api/v1/push/subscriptions")
      .set("Cookie", asCookie(customerToken))
      .send(subscriptionBody(PHONE));
  });

  it("removes my own subscription", async () => {
    const res = await api()
      .delete("/api/v1/push/subscriptions")
      .set("Cookie", asCookie(customerToken))
      .send({ endpoint: PHONE });

    expect(res.status).toBe(200);
    expect(await prisma.pushSubscription.count()).toBe(0);
  });

  it("404s someone else's subscription and leaves it standing", async () => {
    const other = await createAccount("CUSTOMER", { suffix: "thirduser" });

    const res = await api()
      .delete("/api/v1/push/subscriptions")
      .set("Cookie", asCookie(other.token))
      .send({ endpoint: PHONE });

    expect(res.status).toBe(404);
    expect(await prisma.pushSubscription.count()).toBe(1);
  });

  it("404s an endpoint nobody registered", async () => {
    const res = await api()
      .delete("/api/v1/push/subscriptions")
      .set("Cookie", asCookie(customerToken))
      .send({ endpoint: "https://push.example/never-seen" });

    expect(res.status).toBe(404);
  });

  it("goes with the customer when the account is deleted", async () => {
    await prisma.customer.delete({ where: { id: customerId } });

    expect(await prisma.pushSubscription.count()).toBe(0);
  });
});

describe("an order status change reaches the registered browsers", () => {
  beforeEach(async () => {
    for (const endpoint of [PHONE, LAPTOP]) {
      await api()
        .post("/api/v1/push/subscriptions")
        .set("Cookie", asCookie(customerToken))
        .send(subscriptionBody(endpoint));
    }
  });

  it("pushes to both devices", async () => {
    const send = vi
      .spyOn(pushTransport, "send")
      .mockResolvedValue("sent" as never);

    await notificationService.notifyOrderStatusChanged(
      customerId,
      "order_1",
      "OUT_FOR_DELIVERY",
    );

    expect(send).toHaveBeenCalledTimes(2);

    expect(send.mock.calls[0]![1]).toMatchObject({
      body: "Your order is now out for delivery.",
      orderId: "order_1",
    });
  });

  it("prunes a subscription the push service reports gone", async () => {
    vi.spyOn(pushTransport, "send").mockImplementation(
      async (subscription) =>
        (subscription.endpoint === PHONE ? "gone" : "sent") as never,
    );

    await notificationService.notifyOrderStatusChanged(
      customerId,
      "order_1",
      "DELIVERED",
    );

    const remaining = await prisma.pushSubscription.findMany();
    expect(remaining.map((row) => row.endpoint)).toEqual([LAPTOP]);
  });

  it("keeps a subscription whose push merely failed", async () => {
    vi.spyOn(pushTransport, "send").mockResolvedValue("failed" as never);

    await notificationService.notifyOrderStatusChanged(
      customerId,
      "order_1",
      "DELIVERED",
    );

    expect(await prisma.pushSubscription.count()).toBe(2);
  });

  it("does not fail the caller when every push throws", async () => {
    vi.spyOn(pushTransport, "send").mockRejectedValue(
      new Error("push service unreachable"),
    );

    await expect(
      notificationService.notifyOrderStatusChanged(
        customerId,
        "order_1",
        "DELIVERED",
      ),
    ).resolves.toBeUndefined();
  });
});
