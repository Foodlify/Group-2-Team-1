/**
 * The HTTP contract: what a client actually receives.
 *
 * This is the layer every other suite calls past — routing, `validate`, the
 * body parsers, the 404 handler, the error middleware and the security headers
 * only exist on a real request. A service test cannot tell you that a bad
 * `?limit=` returns 400 rather than 500, or that a thrown `AppError` keeps its
 * status by the time it reaches the wire.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import prisma from "../../src/config/prisma";
import { disconnect, resetDatabase } from "./helpers/db";
import { api, asCookie, createAccount } from "./helpers/http";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnect();
});

const seedRestaurants = async (count: number) => {
  for (let i = 0; i < count; i++) {
    await prisma.restaurant.create({ data: { name: `Place ${i}` } });
  }
};

// ═══════════════════════════════════════════════════════════
describe("request validation", () => {
  it("rejects a bad body with 400 and names the offending field", async () => {
    const { token } = await createAccount("ADMIN");

    const res = await api()
      .post("/api/v1/restaurants")
      .set("Cookie", asCookie(token))
      .send({ name: "" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    // A 400 that doesn't say which field failed makes the client guess.
    expect(res.body.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "name" })]),
    );
  });

  it("rejects an unparseable query with 400, not 500", async () => {
    const res = await api().get("/api/v1/restaurants?limit=not-a-number");

    // Bad input from the caller is their error, not ours; a 500 here would
    // page somebody for a typo in a URL.
    expect(res.status).toBe(400);
  });

  it("applies the coerced query, not the raw string", async () => {
    await seedRestaurants(3);

    const res = await api().get("/api/v1/restaurants?limit=2");

    // Express 5 makes `req.query` a getter that re-parses the URL on every
    // read, so the validated value has to be redefined onto the request or it
    // is silently discarded. This is the only place that shows up: the
    // controller would receive the string "2" and paginate on a string.
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.limit).toBe(2);
    expect(res.body.meta.limit).not.toBe("2");
  });

  it("rejects a malformed id in the path", async () => {
    const res = await api().get("/api/v1/restaurants/not-a-cuid");

    expect([400, 404]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it("answers 400 for a body that is not valid JSON", async () => {
    const { token } = await createAccount("ADMIN");

    const res = await api()
      .post("/api/v1/restaurants")
      .set("Cookie", asCookie(token))
      .set("Content-Type", "application/json")
      .send('{"name": ');

    // The body parser rejects this before any route sees it. Without the
    // parser error being handled it surfaces as a bare 500, which tells the
    // caller their own malformed request was a server fault.
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
describe("error responses", () => {
  it("keeps an operational error's own status and message", async () => {
    const { token } = await createAccount("ADMIN");

    const res = await api()
      .get("/api/v1/restaurants/clzzzzzzzzzzzzzzzzzzzzzzz")
      .set("Cookie", asCookie(token));

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false });
    expect(typeof res.body.message).toBe("string");
  });

  it("uses one envelope for every failure", async () => {
    const unauthorised = await api().get("/api/v1/dashboard/overview");
    const missing = await api().get("/api/v1/nope");

    // A client should be able to read `.message` off any failure without
    // knowing which layer produced it.
    for (const res of [unauthorised, missing]) {
      expect(res.body).toHaveProperty("success", false);
      expect(res.body).toHaveProperty("message");
    }
  });

  it("404s an unknown route with JSON, not Express's HTML page", async () => {
    const res = await api().get("/api/v1/does-not-exist");

    expect(res.status).toBe(404);
    expect(res.type).toBe("application/json");
    expect(res.body.message).toContain("not found");
  });

  it("404s a known path used with the wrong method", async () => {
    const res = await api().delete("/api/v1/restaurants");

    expect(res.status).toBe(404);
  });

  it("never leaks a stack trace to the client", async () => {
    const res = await api().get("/api/v1/restaurants?limit=not-a-number");

    const body = JSON.stringify(res.body);
    expect(body).not.toContain("at ");
    expect(body).not.toContain(".ts:");
  });
});

// ═══════════════════════════════════════════════════════════
describe("headers", () => {
  it("sets the security headers on a successful response", async () => {
    const res = await api().get("/api/v1/restaurants");

    // helmet is mounted first precisely so this holds everywhere.
    expect(res.headers).toHaveProperty("x-content-type-options", "nosniff");
    expect(res.headers).toHaveProperty("x-frame-options");
  });

  it("sets them on an error response too", async () => {
    const res = await api().get("/api/v1/dashboard/overview");

    expect(res.status).toBe(401);
    expect(res.headers).toHaveProperty("x-content-type-options", "nosniff");
  });

  it("hides the Express fingerprint", async () => {
    const res = await api().get("/api/v1/restaurants");

    expect(res.headers).not.toHaveProperty("x-powered-by");
  });

  it("allows credentialed cross-origin requests", async () => {
    const res = await api()
      .get("/api/v1/restaurants")
      .set("Origin", "http://localhost:3000");

    // Cookie auth is useless cross-origin without this exact header.
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    expect(res.headers["access-control-allow-origin"]).toBe(
      "http://localhost:3000",
    );
  });
});

// ═══════════════════════════════════════════════════════════
describe("the Stripe webhook's place in the middleware order", () => {
  it("is reachable and rejects an unsigned call", async () => {
    const res = await api()
      .post("/api/v1/payments/stripe/webhook")
      .set("Content-Type", "application/json")
      .send({ type: "checkout.session.completed" });

    // It is mounted before `express.json()` (its signature is computed over
    // the raw bytes) and before the admin router that shares the /payments
    // prefix. A 401 here would mean the admin router matched first and Stripe
    // was being asked for a login it cannot have — the webhook would be dead
    // in production while every local test still passed.
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("is not shadowed by the admin refund routes", async () => {
    // Both live under /api/v1/payments; mounting order decides which wins.
    const res = await api().get("/api/v1/payments/refunds/outstanding");

    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════
describe("the health endpoint", () => {
  it("reports the database it is actually connected to", async () => {
    const res = await api().get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "OK", database: "connected" });
  });
});
