/**
 * The Web Push transport.
 *
 * One distinction carries this file: a push service answering 404 or 410 is
 * not a failure, it is a subscription reaching the end of its life, and the two
 * have to be told apart. Retry a genuine failure and you might get through;
 * retry a gone subscription and you will retry it on every order until someone
 * notices the table full of addresses that can never receive anything.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
    generateVAPIDKeys: vi.fn(),
  },
}));

import webpush from "web-push";
import logger from "../../src/config/logger";

const mockedWebPush = vi.mocked(webpush, true);

const SUBSCRIPTION = {
  endpoint: "https://push.example/abc",
  keys: { p256dh: "p256dh-key", auth: "auth-secret" },
};

/**
 * The transport reads `env` once when the module is constructed, so the
 * configuration under test has to be chosen before the import — and stubbed
 * rather than inherited, or this suite would pass or fail depending on whether
 * the developer running it has VAPID keys in their own `.env`.
 */
const loadWith = async (configured: boolean) => {
  vi.stubEnv("VAPID_PUBLIC_KEY", configured ? "test-public-key" : "");
  vi.stubEnv("VAPID_PRIVATE_KEY", configured ? "test-private-key" : "");
  vi.resetModules();
  const { pushTransport } =
    await import("../../src/shared/push/push.transport");
  return pushTransport;
};

/** A `WebPushError` as the library throws it: a status code on the error. */
const pushError = (statusCode: number) =>
  Object.assign(new Error(`push service said ${statusCode}`), { statusCode });

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

// ═══════════════════════════════════════════════════════════
describe("whether push is switched on at all", () => {
  it("is off when the keys are absent, and sends nothing", async () => {
    const transport = await loadWith(false);

    expect(transport.isConfigured).toBe(false);
    expect(await transport.send(SUBSCRIPTION, { a: 1 })).toBe("disabled");
    // Not merely "returned early" — the library must never be called, or an
    // unconfigured deployment throws from inside web-push on every order.
    expect(mockedWebPush.sendNotification).not.toHaveBeenCalled();
  });

  it("reports no public key when it is off", async () => {
    const transport = await loadWith(false);

    // Null rather than an empty string: a browser handed "" would call
    // subscribe() with it and fail somewhere nobody can act on.
    expect(transport.publicKey).toBeNull();
  });

  it("registers the VAPID details exactly once when it is on", async () => {
    const transport = await loadWith(true);

    expect(transport.isConfigured).toBe(true);
    expect(transport.publicKey).toBe("test-public-key");
    expect(mockedWebPush.setVapidDetails).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════
describe("what the push service's answer means", () => {
  it("reports a delivered push as sent", async () => {
    const transport = await loadWith(true);
    mockedWebPush.sendNotification.mockResolvedValue({} as never);

    expect(await transport.send(SUBSCRIPTION, { orderId: "o1" })).toBe("sent");
  });

  it("serialises the payload, because the library takes a string", async () => {
    const transport = await loadWith(true);
    mockedWebPush.sendNotification.mockResolvedValue({} as never);

    await transport.send(SUBSCRIPTION, { title: "Order update" });

    expect(mockedWebPush.sendNotification).toHaveBeenCalledWith(
      SUBSCRIPTION,
      JSON.stringify({ title: "Order update" }),
    );
  });

  it.each([404, 410])("treats %i as gone, not as a failure", async (code) => {
    const transport = await loadWith(true);
    mockedWebPush.sendNotification.mockRejectedValue(pushError(code));

    expect(await transport.send(SUBSCRIPTION, {})).toBe("gone");
  });

  it("does not log a gone subscription as an error", async () => {
    const transport = await loadWith(true);
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => logger);
    mockedWebPush.sendNotification.mockRejectedValue(pushError(410));

    await transport.send(SUBSCRIPTION, {});

    // Browsers expire subscriptions routinely. Logging each one as an error
    // trains everybody to ignore the error log.
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it.each([429, 500, 503])(
    "treats %i as a failure the subscription survives",
    async (code) => {
      const transport = await loadWith(true);
      mockedWebPush.sendNotification.mockRejectedValue(pushError(code));

      // The push service being rate-limited or down says nothing about whether
      // this browser still exists.
      expect(await transport.send(SUBSCRIPTION, {})).toBe("failed");
    },
  );

  it("treats an error with no status code as a failure", async () => {
    const transport = await loadWith(true);
    mockedWebPush.sendNotification.mockRejectedValue(
      new Error("socket hang up"),
    );

    // A network error carries no status. Reading "no status" as gone would
    // delete every subscription the first time the network blipped.
    expect(await transport.send(SUBSCRIPTION, {})).toBe("failed");
  });

  it("never throws, whatever the library does", async () => {
    const transport = await loadWith(true);
    mockedWebPush.sendNotification.mockRejectedValue(pushError(500));

    // The caller is an order that has already committed.
    await expect(transport.send(SUBSCRIPTION, {})).resolves.toBe("failed");
  });
});
