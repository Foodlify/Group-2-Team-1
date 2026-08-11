import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import prisma from "../../src/config/prisma";
import { googleAuthClient } from "../../src/shared/auth/google.client";
import { hashPassword } from "../../src/shared/auth/password.helper";
import { disconnect, resetDatabase } from "./helpers/db";
import { api, asCookie } from "./helpers/http";

const PROFILE = {
  googleId: "google-sub-abc",
  email: "signin@example.com",
  emailVerified: true,
  name: "Google Person",
};

const completeFlow = async (overrides: Partial<typeof PROFILE> = {}) => {
  vi.spyOn(googleAuthClient, "exchangeCode").mockResolvedValue({
    ...PROFILE,
    ...overrides,
  });

  const start = await api().get("/api/v1/auth/google");
  const stateCookie = (start.headers["set-cookie"] as unknown as string[]).find(
    (cookie) => cookie.startsWith("oauthState="),
  )!;
  const state = decodeURIComponent(
    stateCookie.split(";")[0]!.split("=").slice(1).join("="),
  );

  const callback = await api()
    .get(`/api/v1/auth/google/callback?code=auth-code&state=${state}`)
    .set("Cookie", `oauthState=${encodeURIComponent(state)}`);

  return { start, callback, state };
};

beforeEach(async () => {
  await resetDatabase();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await disconnect();
});

describe("starting the flow", () => {
  it("redirects to Google and sets a state cookie", async () => {
    const res = await api().get("/api/v1/auth/google");

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("accounts.google.com");
    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies.some((cookie) => cookie.startsWith("oauthState="))).toBe(
      true,
    );
  });

  it("puts that same state in the URL Google is given", async () => {
    const res = await api().get("/api/v1/auth/google");

    const cookie = (res.headers["set-cookie"] as unknown as string[]).find(
      (entry) => entry.startsWith("oauthState="),
    )!;
    const state = decodeURIComponent(
      cookie.split(";")[0]!.split("=").slice(1).join("="),
    );

    expect(res.headers.location).toContain(encodeURIComponent(state));
  });

  it("asks for identity scopes only", async () => {
    const res = await api().get("/api/v1/auth/google");

    const url = new URL(res.headers.location as string);
    const scopes = (url.searchParams.get("scope") ?? "").split(" ");
    expect(scopes.sort()).toEqual(["email", "openid", "profile"]);

    expect(url.searchParams.get("access_type")).not.toBe("offline");
  });

  it("issues a different state every time", async () => {
    const stateOf = async () => {
      const res = await api().get("/api/v1/auth/google");
      return (res.headers["set-cookie"] as unknown as string[]).find((entry) =>
        entry.startsWith("oauthState="),
      );
    };

    expect(await stateOf()).not.toBe(await stateOf());
  });

  it("marks the state cookie httpOnly", async () => {
    const res = await api().get("/api/v1/auth/google");

    const cookie = (res.headers["set-cookie"] as unknown as string[]).find(
      (entry) => entry.startsWith("oauthState="),
    )!;

    expect(cookie.toLowerCase()).toContain("httponly");
  });
});

describe("the state round-trip", () => {
  it("refuses a callback carrying no state at all", async () => {
    const res = await api().get("/api/v1/auth/google/callback?code=abc");

    expect(res.status).toBe(400);
  });

  it("refuses a callback whose state does not match the cookie", async () => {
    const exchange = vi.spyOn(googleAuthClient, "exchangeCode");

    const res = await api()
      .get("/api/v1/auth/google/callback?code=abc&state=attacker-state")
      .set("Cookie", "oauthState=our-state");

    expect(res.status).toBe(400);
    expect(exchange).not.toHaveBeenCalled();
    expect(await prisma.user.count()).toBe(0);
  });

  it("refuses a state that is a prefix of the real one", async () => {
    const res = await api()
      .get("/api/v1/auth/google/callback?code=abc&state=our")
      .set("Cookie", "oauthState=our-state");

    expect(res.status).toBe(400);
  });

  it("refuses a wrong state of exactly the right length", async () => {
    const exchange = vi.spyOn(googleAuthClient, "exchangeCode");

    const res = await api()
      .get(`/api/v1/auth/google/callback?code=abc&state=${"b".repeat(43)}`)
      .set("Cookie", `oauthState=${"a".repeat(43)}`);

    expect(res.status).toBe(400);
    expect(exchange).not.toHaveBeenCalled();
  });

  it("accepts a state that matches exactly", async () => {
    const { callback } = await completeFlow();

    expect(callback.status).toBe(200);
  });

  it("clears the state cookie so a failed attempt cannot be retried", async () => {
    const res = await api()
      .get("/api/v1/auth/google/callback?code=abc&state=wrong")
      .set("Cookie", "oauthState=our-state");

    const cookies = (res.headers["set-cookie"] as unknown as string[]) ?? [];
    expect(
      cookies.some(
        (cookie) =>
          cookie.startsWith("oauthState=") &&
          (cookie.includes("Expires=Thu, 01 Jan 1970") ||
            cookie.includes("Max-Age=0")),
      ),
    ).toBe(true);
  });

  it("reports a declined consent screen without touching the exchange", async () => {
    const exchange = vi.spyOn(googleAuthClient, "exchangeCode");

    const res = await api()
      .get("/api/v1/auth/google/callback?error=access_denied&state=our-state")
      .set("Cookie", "oauthState=our-state");

    expect(res.status).toBe(401);
    expect(exchange).not.toHaveBeenCalled();
  });
});

describe("signing in", () => {
  it("creates a customer with no password and no phone", async () => {
    const { callback } = await completeFlow();

    expect(callback.status).toBe(200);
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: PROFILE.email },
      include: { customer: true },
    });
    expect(user.password).toBeNull();
    expect(user.googleId).toBe(PROFILE.googleId);

    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.customer?.phone).toBeNull();
  });

  it("sets our own session cookies", async () => {
    const { callback } = await completeFlow();

    const cookies = callback.headers["set-cookie"] as unknown as string[];
    expect(cookies.some((cookie) => cookie.startsWith("accessToken="))).toBe(
      true,
    );
    expect(cookies.some((cookie) => cookie.startsWith("refreshToken="))).toBe(
      true,
    );
  });

  it("hands back a session that actually works", async () => {
    const { callback } = await completeFlow();

    const accessCookie = (
      callback.headers["set-cookie"] as unknown as string[]
    ).find((cookie) => cookie.startsWith("accessToken="))!;
    const token = accessCookie.split(";")[0]!.split("=")[1]!;

    const me = await api()
      .get("/api/v1/customers/me")
      .set("Cookie", asCookie(token));

    expect(me.status).toBe(200);
    expect(me.body.data.phone).toBeNull();
  });

  it("signs the same person back in without creating a second account", async () => {
    await completeFlow();
    await completeFlow();

    expect(await prisma.user.count()).toBe(1);
  });

  it("stores no Google credentials of any kind", async () => {
    await completeFlow();

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: PROFILE.email },
    });

    expect(JSON.stringify(user)).not.toContain("ya29.");
    expect(user.googleId).toBe(PROFILE.googleId);
  });
});

describe("meeting an account that already exists", () => {
  const registerPasswordAccount = async (isActive = true) =>
    prisma.user.create({
      data: {
        name: "Existing",
        email: PROFILE.email,
        password: await hashPassword("Passw0rd!23"),
        emailVerifiedAt: new Date(),
        isActive,
        customer: { create: { phone: "01000000999" } },
      },
    });

  it("links to it rather than creating a duplicate", async () => {
    const existing = await registerPasswordAccount();

    const { callback } = await completeFlow();

    expect(callback.status).toBe(200);
    expect(await prisma.user.count()).toBe(1);
    const after = await prisma.user.findUniqueOrThrow({
      where: { id: existing.id },
    });
    expect(after.googleId).toBe(PROFILE.googleId);

    expect(after.password).not.toBeNull();
  });

  it("refuses to link when Google has not verified the email", async () => {
    const existing = await registerPasswordAccount();

    const { callback } = await completeFlow({ emailVerified: false });

    expect(callback.status).toBe(403);
    const after = await prisma.user.findUniqueOrThrow({
      where: { id: existing.id },
    });
    expect(after.googleId).toBeNull();
  });

  it("keeps a disabled account shut", async () => {
    await registerPasswordAccount(false);

    const { callback } = await completeFlow();

    expect(callback.status).toBe(403);
    const after = await prisma.user.findUniqueOrThrow({
      where: { email: PROFILE.email },
    });
    expect(after.googleId).toBeNull();
  });

  it("does not let a Google-only account be logged into with a password", async () => {
    await completeFlow();

    const res = await api()
      .post("/api/v1/auth/login")
      .send({ email: PROFILE.email, password: "Passw0rd!23" });

    expect(res.status).toBe(401);
  });
});
