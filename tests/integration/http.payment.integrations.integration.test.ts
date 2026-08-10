import { afterAll, beforeEach, describe, expect, it } from "vitest";
import prisma from "../../src/config/prisma";
import { paymentIntegrationService } from "../../src/modules/payment/integration.service";
import {
  createCartWithItem,
  createCatalog,
  disconnect,
  resetDatabase,
} from "./helpers/db";
import { api, asCookie, createAccount } from "./helpers/http";

const seedIntegrations = async () => {
  const cash = await prisma.paymentIntegrationType.create({
    data: {
      code: "cash",
      displayName: "Cash on delivery",
      paymentMethod: "CASH",
      configuration: { create: { currency: "EGP", isTestMode: false } },
    },
  });
  const stripe = await prisma.paymentIntegrationType.create({
    data: {
      code: "stripe",
      displayName: "Stripe Checkout",
      paymentMethod: "CREDIT_CARD",
      configuration: {
        create: {
          currency: "EGP",
          isTestMode: true,
          secretKeyEnvVar: "STRIPE_SECRET_KEY",
          webhookSecretEnvVar: "STRIPE_WEBHOOK_SECRET",
        },
      },
    },
  });
  return { cash, stripe };
};

const readyToCheckout = async () => {
  const { customer, token } = await createAccount("CUSTOMER", {
    suffix: "buyer",
  });
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
  return { address, token };
};

let adminToken: string;

beforeEach(async () => {
  await resetDatabase();
  await seedIntegrations();
  ({ token: adminToken } = await createAccount("ADMIN"));
});

afterAll(async () => {
  await disconnect();
});

describe("the migration's seed", () => {
  it("gives a fresh deployment both integrations, enabled", async () => {
    const res = await api()
      .get("/api/v1/payments/integrations")
      .set("Cookie", asCookie(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.data.map((i: { code: string }) => i.code)).toEqual([
      "cash",
      "stripe",
    ]);

    expect(
      res.body.data.every((i: { isEnabled: boolean }) => i.isEnabled),
    ).toBe(true);
  });

  it("records where each secret lives, not the secret", async () => {
    const res = await api()
      .get("/api/v1/payments/integrations")
      .set("Cookie", asCookie(adminToken));

    const stripe = res.body.data.find(
      (i: { code: string }) => i.code === "stripe",
    );
    expect(stripe.configuration.secretKeyEnvVar).toBe("STRIPE_SECRET_KEY");
    expect(stripe.configuration.webhookSecretEnvVar).toBe(
      "STRIPE_WEBHOOK_SECRET",
    );
  });
});

describe("what a secret is allowed to do here", () => {
  it("never stores one, whatever the payload calls it", async () => {
    await api()
      .patch("/api/v1/payments/integrations/stripe")
      .set("Cookie", asCookie(adminToken))
      .send({
        secretKeyEnvVar: "STRIPE_SECRET_KEY",
        secretKey: "sk_live_should_never_be_stored",
        apiKey: "sk_live_either",
      });

    const rows = await prisma.paymentIntegrationConfiguration.findMany();
    expect(JSON.stringify(rows)).not.toContain("sk_live");
  });

  it("does not return the key even when one is really set", async () => {
    const CANARY = "sk_test_canary_must_never_be_returned";
    const previous = process.env.STRIPE_SECRET_KEY;
    process.env.STRIPE_SECRET_KEY = CANARY;
    try {
      const res = await api()
        .get("/api/v1/payments/integrations")
        .set("Cookie", asCookie(adminToken));

      const stripe = res.body.data.find(
        (i: { code: string }) => i.code === "stripe",
      );

      expect(stripe.configuration.secretConfigured).toBe(true);
      expect(JSON.stringify(res.body)).not.toContain(CANARY);
    } finally {
      process.env.STRIPE_SECRET_KEY = previous;
    }
  });

  it("reports whether the named variable is set, without its value", async () => {
    const res = await api()
      .get("/api/v1/payments/integrations")
      .set("Cookie", asCookie(adminToken));

    const stripe = res.body.data.find(
      (i: { code: string }) => i.code === "stripe",
    );
    expect(stripe.configuration.secretConfigured).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain("sk_");
  });
});

describe("the kill switch", () => {
  it("refuses a payment once the integration is switched off", async () => {
    await api()
      .patch("/api/v1/payments/integrations/cash")
      .set("Cookie", asCookie(adminToken))
      .send({ isEnabled: false });

    expect(await paymentIntegrationService.isMethodEnabled("CASH")).toBe(false);
    await expect(
      paymentIntegrationService.assertMethodEnabled("CASH"),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("stops a real checkout, not just a direct call to the service", async () => {
    const buyer = await readyToCheckout();

    await api()
      .patch("/api/v1/payments/integrations/cash")
      .set("Cookie", asCookie(adminToken))
      .send({ isEnabled: false });

    const res = await api()
      .post("/api/v1/orders")
      .set("Cookie", asCookie(buyer.token))
      .send({ addressId: buyer.address.id, paymentMethod: "CASH" });

    expect(res.status).toBe(400);
    expect(await prisma.order.count()).toBe(0);
  });

  it("lets it back through when switched on again", async () => {
    await api()
      .patch("/api/v1/payments/integrations/cash")
      .set("Cookie", asCookie(adminToken))
      .send({ isEnabled: false });
    await api()
      .patch("/api/v1/payments/integrations/cash")
      .set("Cookie", asCookie(adminToken))
      .send({ isEnabled: true });

    await expect(
      paymentIntegrationService.assertMethodEnabled("CASH"),
    ).resolves.toBeUndefined();
  });

  it("switching one off leaves the other alone", async () => {
    await api()
      .patch("/api/v1/payments/integrations/stripe")
      .set("Cookie", asCookie(adminToken))
      .send({ isEnabled: false });

    expect(await paymentIntegrationService.isMethodEnabled("CASH")).toBe(true);
    expect(await paymentIntegrationService.isMethodEnabled("CREDIT_CARD")).toBe(
      false,
    );
  });

  it("keeps taking payments when the table is empty", async () => {
    await prisma.paymentIntegrationType.deleteMany();

    await expect(
      paymentIntegrationService.assertMethodEnabled("CASH"),
    ).resolves.toBeUndefined();
  });
});

describe("configuring an integration", () => {
  it("changes only the fields the request carried", async () => {
    await api()
      .patch("/api/v1/payments/integrations/stripe")
      .set("Cookie", asCookie(adminToken))
      .send({ isTestMode: false });

    const row = await prisma.paymentIntegrationConfiguration.findFirstOrThrow({
      where: { type: { code: "stripe" } },
    });

    expect(row.isTestMode).toBe(false);
    expect(row.currency).toBe("EGP");
    expect(row.secretKeyEnvVar).toBe("STRIPE_SECRET_KEY");
  });

  it("400s an empty body rather than reporting a no-op as applied", async () => {
    const res = await api()
      .patch("/api/v1/payments/integrations/stripe")
      .set("Cookie", asCookie(adminToken))
      .send({});

    expect(res.status).toBe(400);
  });

  it("404s a code that matches no integration", async () => {
    const res = await api()
      .patch("/api/v1/payments/integrations/paypal")
      .set("Cookie", asCookie(adminToken))
      .send({ isEnabled: false });

    expect(res.status).toBe(404);
  });

  it("403s a customer", async () => {
    const { token } = await createAccount("CUSTOMER");

    const res = await api()
      .patch("/api/v1/payments/integrations/stripe")
      .set("Cookie", asCookie(token))
      .send({ isEnabled: false });

    expect(res.status).toBe(403);
  });

  it("401s an anonymous caller reading the list", async () => {
    const res = await api().get("/api/v1/payments/integrations");
    expect(res.status).toBe(401);
  });

  it("exposes no way to create or delete an integration", async () => {
    const post = await api()
      .post("/api/v1/payments/integrations")
      .set("Cookie", asCookie(adminToken))
      .send({ code: "paypal" });
    const del = await api()
      .delete("/api/v1/payments/integrations/stripe")
      .set("Cookie", asCookie(adminToken));

    expect(post.status).toBe(404);
    expect(del.status).toBe(404);
  });
});
