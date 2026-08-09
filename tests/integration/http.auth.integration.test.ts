/**
 * The authentication and authorization layer, over real HTTP.
 *
 * Every assertion here needs the middleware chain to actually run, so none of
 * it is reachable from a service test: `authenticate` reads a cookie or header
 * off a real request, re-resolves the account against a real database, and
 * `authorize` runs only if it called `next()`.
 *
 * The rate limiter is deliberately absent — it skips itself under
 * `NODE_ENV=test`, which this config sets. Its behaviour under load is a
 * separate open item, and pretending otherwise here would be a false pass.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import prisma from "../../src/config/prisma";
import { disconnect, resetDatabase } from "./helpers/db";
import {
  accessTokenFor,
  api,
  asCookie,
  createAccount,
  refreshTokenFor,
  TEST_PASSWORD,
} from "./helpers/http";

const ADMIN_ROUTE = "/api/v1/dashboard/overview";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnect();
});

// ═══════════════════════════════════════════════════════════
describe("presenting no usable credentials", () => {
  it("401s a protected route with no token at all", async () => {
    const res = await api().get(ADMIN_ROUTE);

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ success: false });
  });

  it("401s a token that is not a JWT", async () => {
    const res = await api()
      .get(ADMIN_ROUTE)
      .set("Cookie", asCookie("not-a-token"));

    expect(res.status).toBe(401);
  });

  it("401s a token signed with the wrong secret", async () => {
    // Correctly shaped and unexpired — only the signature is wrong. Decoding
    // without verifying would let this through.
    const forged = [
      Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
        "base64url",
      ),
      Buffer.from(
        JSON.stringify({
          id: "someone",
          email: "a@b.c",
          role: "ADMIN",
          type: "access",
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      ).toString("base64url"),
      "not-a-real-signature",
    ].join(".");

    const res = await api().get(ADMIN_ROUTE).set("Cookie", asCookie(forged));

    expect(res.status).toBe(401);
  });

  it("401s a *refresh* token presented as an access token", async () => {
    const { user } = await createAccount("ADMIN");

    // A genuine, unexpired, correctly signed token from this very app. Only
    // its `type` says it is the wrong one — and both are signed with the same
    // secret by default, so the signature check alone cannot tell them apart.
    const res = await api()
      .get(ADMIN_ROUTE)
      .set("Cookie", asCookie(refreshTokenFor(user)));

    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════
describe("credentials that were valid when issued", () => {
  it("401s once the account has been deleted", async () => {
    const { user, token } = await createAccount("ADMIN");
    await prisma.user.delete({ where: { id: user.id } });

    // The token is still perfectly valid and unexpired. Trusting it without
    // re-resolving the account would keep a deleted admin working for the rest
    // of the token's lifetime.
    const res = await api().get(ADMIN_ROUTE).set("Cookie", asCookie(token));

    expect(res.status).toBe(401);
  });

  it("403s once the account is disabled", async () => {
    const { user, token } = await createAccount("ADMIN");
    await prisma.user.update({
      where: { id: user.id },
      data: { isActive: false },
    });

    const res = await api().get(ADMIN_ROUTE).set("Cookie", asCookie(token));

    // 403, not 401: the credentials are fine, the account is not — and saying
    // so is what makes a disabled account distinguishable from a bad password.
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/disabled/i);
  });
});

// ═══════════════════════════════════════════════════════════
describe("role enforcement", () => {
  it("403s a customer on an admin-only route", async () => {
    const { token } = await createAccount("CUSTOMER");

    const res = await api().get(ADMIN_ROUTE).set("Cookie", asCookie(token));

    // Authenticated but not permitted — the distinction `authorize` exists for.
    expect(res.status).toBe(403);
  });

  it("lets an admin through the same route", async () => {
    const { token } = await createAccount("ADMIN");

    const res = await api().get(ADMIN_ROUTE).set("Cookie", asCookie(token));

    expect(res.status).toBe(200);
  });

  it("takes the role from the account, not from the token's claim", async () => {
    // The row says CUSTOMER; the token says ADMIN. The token is signed with
    // the real secret, so the signature proves nothing here — only re-reading
    // the row can tell the difference.
    const { user } = await createAccount("CUSTOMER");
    const escalated = accessTokenFor({ ...user, role: "ADMIN" });

    const res = await api().get(ADMIN_ROUTE).set("Cookie", asCookie(escalated));

    expect(res.status).toBe(403);
  });

  it("drops a demoted admin immediately instead of at token expiry", async () => {
    const { user, token } = await createAccount("ADMIN");
    await prisma.user.update({
      where: { id: user.id },
      data: { role: "CUSTOMER" },
    });

    const res = await api().get(ADMIN_ROUTE).set("Cookie", asCookie(token));

    // The same rule the account lookup already applies to deleted and disabled
    // accounts. A demotion that only takes effect when the token expires
    // leaves someone admin for up to fifteen more minutes.
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════
describe("how the token travels", () => {
  it("accepts the httpOnly cookie", async () => {
    const { token } = await createAccount("ADMIN");

    const res = await api().get(ADMIN_ROUTE).set("Cookie", asCookie(token));

    expect(res.status).toBe(200);
  });

  it("accepts an Authorization: Bearer header", async () => {
    const { token } = await createAccount("ADMIN");

    const res = await api()
      .get(ADMIN_ROUTE)
      .set("Authorization", `Bearer ${token}`);

    // The documented fallback for tooling and tests. Dropping it would break
    // every non-browser client.
    expect(res.status).toBe(200);
  });

  it("prefers the cookie when both are present", async () => {
    const { token: adminToken } = await createAccount("ADMIN");
    const { token: customerToken } = await createAccount("CUSTOMER");

    const res = await api()
      .get(ADMIN_ROUTE)
      .set("Cookie", asCookie(adminToken))
      .set("Authorization", `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
  });

  it("ignores a bare Authorization header without the Bearer scheme", async () => {
    const { token } = await createAccount("ADMIN");

    const res = await api().get(ADMIN_ROUTE).set("Authorization", token);

    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════
describe("login writes cookies a browser will actually keep", () => {
  it("sets both tokens httpOnly, scoped to the whole site", async () => {
    await createAccount("CUSTOMER");

    const res = await api()
      .post("/api/v1/auth/login")
      .send({ email: "http-customer@example.com", password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    const cookies = res.get("Set-Cookie") ?? [];
    const access = cookies.find((c) => c.startsWith("accessToken="));
    const refresh = cookies.find((c) => c.startsWith("refreshToken="));

    // httpOnly is the whole point of this transport: it is what keeps the
    // token out of reach of any script on the page.
    expect(access).toMatch(/HttpOnly/i);
    expect(refresh).toMatch(/HttpOnly/i);
    expect(access).toMatch(/Path=\//i);
    expect(access).toMatch(/SameSite=Lax/i);
  });

  it("does not mark them Secure outside production", async () => {
    await createAccount("CUSTOMER");

    const res = await api()
      .post("/api/v1/auth/login")
      .send({ email: "http-customer@example.com", password: TEST_PASSWORD });

    // A Secure cookie is dropped by the browser over plain http, so forcing it
    // on in development silently logs everyone out.
    expect(res.get("Set-Cookie")?.join(";")).not.toMatch(/Secure/i);
  });

  it("does not put the tokens in the response body as well", async () => {
    await createAccount("CUSTOMER");

    const res = await api()
      .post("/api/v1/auth/login")
      .send({ email: "http-customer@example.com", password: TEST_PASSWORD });

    // Echoing the token into JSON would hand it straight back to the scripts
    // httpOnly was meant to hide it from.
    expect(JSON.stringify(res.body)).not.toContain("eyJ");
  });

  it("rejects a wrong password without saying which half was wrong", async () => {
    await createAccount("CUSTOMER");

    const res = await api()
      .post("/api/v1/auth/login")
      .send({ email: "http-customer@example.com", password: "wrong-password" });

    expect(res.status).toBe(401);
    expect(res.get("Set-Cookie")).toBeUndefined();
  });

  it("clears both cookies on logout", async () => {
    const { token } = await createAccount("CUSTOMER");

    const res = await api()
      .post("/api/v1/auth/logout")
      .set("Cookie", asCookie(token));

    const cleared = (res.get("Set-Cookie") ?? []).join(";");
    expect(cleared).toContain("accessToken=;");
    expect(cleared).toContain("refreshToken=;");
  });
});

// ═══════════════════════════════════════════════════════════
describe("routes open to guests as well as customers", () => {
  it("lets a request with no token reach the controller", async () => {
    const res = await api().get("/api/v1/carts");

    // `optionalAuthenticate` must call `next()` rather than reject — the guest
    // cart is the reason it exists. The controller then asks for the cart
    // token, which is the controller's business, not the middleware's. What
    // matters here is that it is the *controller* answering and not a 401.
    expect(res.status).not.toBe(401);
    expect(res.body.message).toMatch(/X-Cart-Token|sign in/i);
  });

  it("still rejects a token that is present but bad", async () => {
    const res = await api()
      .get("/api/v1/carts")
      .set("Cookie", asCookie("garbage"));

    // Silently downgrading a broken token to "guest" would hide an expired
    // session from the client and quietly detach them from their own cart.
    expect(res.status).toBe(401);
  });

  it("rejects a valid token belonging to a disabled account", async () => {
    const { user, token } = await createAccount("CUSTOMER");
    await prisma.user.update({
      where: { id: user.id },
      data: { isActive: false },
    });

    const res = await api().get("/api/v1/carts").set("Cookie", asCookie(token));

    expect(res.status).toBe(403);
  });
});
