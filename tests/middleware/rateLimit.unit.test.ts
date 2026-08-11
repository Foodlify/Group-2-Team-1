import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Application } from "express";
import request from "supertest";

const loadLimiters = async (nodeEnv = "production") => {
  vi.resetModules();
  vi.doMock("../../src/config/env", () => ({
    default: { NODE_ENV: nodeEnv, TRUST_PROXY: 0 },
  }));
  vi.doMock("../../src/config/logger", () => ({
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }));
  return import("../../src/middlewares/rateLimit.middleware");
};

const appWith = (
  limiter: express.RequestHandler,
  trustProxy: boolean | number = false,
): Application => {
  const app = express();
  app.set("trust proxy", trustProxy);
  app.get("/thing", limiter, (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return app;
};

const hit = (app: Application, forwardedFor?: string) => {
  const req = request(app).get("/thing");
  return forwardedFor ? req.set("X-Forwarded-For", forwardedFor) : req;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("it actually limits", () => {
  it("allows requests up to the limit and refuses the next one", async () => {
    const { authLimiter } = await loadLimiters();
    const app = appWith(authLimiter);

    for (let i = 0; i < 20; i++) {
      const res = await hit(app);
      expect(res.status).toBe(200);
    }

    const blocked = await hit(app);
    expect(blocked.status).toBe(429);
  });

  it("answers with the same error envelope as the rest of the API", async () => {
    const { authLimiter } = await loadLimiters();
    const app = appWith(authLimiter);

    for (let i = 0; i < 20; i++) await hit(app);
    const res = await hit(app);

    expect(res.body).toMatchObject({ success: false });
    expect(res.body.message).toMatch(/too many/i);
  });

  it("tells the client its budget in standard headers", async () => {
    const { apiLimiter } = await loadLimiters();
    const app = appWith(apiLimiter);

    const res = await hit(app);

    expect(res.headers).toHaveProperty("ratelimit");
    expect(res.headers).toHaveProperty("ratelimit-policy");
    expect(res.headers).not.toHaveProperty("x-ratelimit-limit");
  });

  it("keeps the auth limit stricter than the general one", async () => {
    const { authLimiter, apiLimiter } = await loadLimiters();

    const auth = appWith(authLimiter);
    const api = appWith(apiLimiter);

    const authPolicy = (await hit(auth)).headers["ratelimit-policy"];
    const apiPolicy = (await hit(api)).headers["ratelimit-policy"];

    expect(authPolicy).not.toBe(apiPolicy);
  });
});

describe("what counts as one client", () => {
  it("puts every caller in ONE bucket when the proxy is not trusted", async () => {
    const { authLimiter } = await loadLimiters();
    const app = appWith(authLimiter, false);

    for (let i = 0; i < 20; i++) {
      const res = await hit(app, `203.0.113.${i}`);
      expect(res.status).toBe(200);
    }

    const victim = await hit(app, "198.51.100.77");

    expect(victim.status).toBe(429);
  });

  it("separates callers once the proxy is trusted", async () => {
    const { authLimiter } = await loadLimiters();
    const app = appWith(authLimiter, 1);

    for (let i = 0; i < 20; i++) {
      expect((await hit(app, "203.0.113.9")).status).toBe(200);
    }
    expect((await hit(app, "203.0.113.9")).status).toBe(429);

    const other = await hit(app, "198.51.100.77");
    expect(other.status).toBe(200);
  });

  it("only trusts as many hops as it is told", async () => {
    const { authLimiter } = await loadLimiters();

    const app = appWith(authLimiter, 1);

    for (let i = 0; i < 20; i++) {
      await hit(app, `1.1.1.${i}, 203.0.113.9`);
    }

    const spoofed = await hit(app, "9.9.9.9, 203.0.113.9");
    expect(spoofed.status).toBe(429);
  });
});

describe("the test-environment escape hatch", () => {
  it("is skipped entirely under NODE_ENV=test", async () => {
    const { authLimiter } = await loadLimiters("test");
    const app = appWith(authLimiter);

    for (let i = 0; i < 25; i++) {
      expect((await hit(app)).status).toBe(200);
    }
  });

  it("is active in development, not only production", async () => {
    const { authLimiter } = await loadLimiters("development");
    const app = appWith(authLimiter);

    for (let i = 0; i < 20; i++) await hit(app);

    expect((await hit(app)).status).toBe(429);
  });
});
