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

    const res = await api()
      .get(ADMIN_ROUTE)
      .set("Cookie", asCookie(refreshTokenFor(user)));

    expect(res.status).toBe(401);
  });
});

describe("credentials that were valid when issued", () => {
  it("401s once the account has been deleted", async () => {
    const { user, token } = await createAccount("ADMIN");
    await prisma.user.delete({ where: { id: user.id } });

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

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/disabled/i);
  });
});

describe("role enforcement", () => {
  it("403s a customer on an admin-only route", async () => {
    const { token } = await createAccount("CUSTOMER");

    const res = await api().get(ADMIN_ROUTE).set("Cookie", asCookie(token));

    expect(res.status).toBe(403);
  });

  it("lets an admin through the same route", async () => {
    const { token } = await createAccount("ADMIN");

    const res = await api().get(ADMIN_ROUTE).set("Cookie", asCookie(token));

    expect(res.status).toBe(200);
  });

  it("takes the role from the account, not from the token's claim", async () => {
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

    expect(res.status).toBe(403);
  });
});

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

    expect(res.get("Set-Cookie")?.join(";")).not.toMatch(/Secure/i);
  });

  it("does not put the tokens in the response body as well", async () => {
    await createAccount("CUSTOMER");

    const res = await api()
      .post("/api/v1/auth/login")
      .send({ email: "http-customer@example.com", password: TEST_PASSWORD });

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

  it("survives the same account logging in twice in a row", async () => {
    await createAccount("CUSTOMER");
    const login = () =>
      api()
        .post("/api/v1/auth/login")
        .send({ email: "http-customer@example.com", password: TEST_PASSWORD });

    const first = await login();
    const second = await login();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const rows = await prisma.refreshToken.count();
    expect(rows).toBe(2);
  });

  it("stores a distinct row for every session in a burst", async () => {
    await createAccount("CUSTOMER");

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        api().post("/api/v1/auth/login").send({
          email: "http-customer@example.com",
          password: TEST_PASSWORD,
        }),
      ),
    );

    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(await prisma.refreshToken.count()).toBe(5);
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

describe("routes open to guests as well as customers", () => {
  it("lets a request with no token reach the controller", async () => {
    const res = await api().get("/api/v1/carts");

    expect(res.status).not.toBe(401);
    expect(res.body.message).toMatch(/X-Cart-Token|sign in/i);
  });

  it("still rejects a token that is present but bad", async () => {
    const res = await api()
      .get("/api/v1/carts")
      .set("Cookie", asCookie("garbage"));

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
