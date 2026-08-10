import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/push/push.repository", () => ({
  pushRepository: {
    upsertSubscription: vi.fn(),
    findByCustomerId: vi.fn(),
    deleteForCustomer: vi.fn(),
    deleteByEndpoints: vi.fn(),
  },
}));

vi.mock("../../src/shared/push/push.transport", () => ({
  pushTransport: {
    isConfigured: true,
    publicKey: "test-public-key",
    send: vi.fn(),
  },
}));

import { pushService } from "../../src/modules/push/push.service";
import { pushRepository } from "../../src/modules/push/push.repository";
import { pushTransport } from "../../src/shared/push/push.transport";
import { pushErrors } from "../../src/shared/exceptions/push.errors";

const mockedRepo = vi.mocked(pushRepository);
const mockedTransport = vi.mocked(pushTransport, true);

const now = new Date("2026-08-11T10:00:00.000Z");
const subscription = (endpoint: string) => ({
  id: `sub_${endpoint}`,
  customerId: "cust_1",
  endpoint,
  p256dh: "p256dh",
  auth: "auth",
  userAgent: "Firefox",
  createdAt: now,
  updatedAt: now,
});

const MESSAGE = { title: "Order update", body: "…", orderId: "order_1" };

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(mockedTransport, "isConfigured", {
    value: true,
    configurable: true,
  });
  mockedRepo.findByCustomerId.mockResolvedValue([]);
  mockedRepo.deleteByEndpoints.mockResolvedValue(0);
  mockedTransport.send.mockResolvedValue("sent");
});

describe("notifying a customer", () => {
  it("pushes to every browser they have registered", async () => {
    mockedRepo.findByCustomerId.mockResolvedValue([
      subscription("https://push.example/phone"),
      subscription("https://push.example/laptop"),
    ] as never);

    await pushService.notifyCustomer("cust_1", MESSAGE);

    expect(mockedTransport.send).toHaveBeenCalledTimes(2);
  });

  it("sends the browser's own keys with each push", async () => {
    mockedRepo.findByCustomerId.mockResolvedValue([
      subscription("https://push.example/phone"),
    ] as never);

    await pushService.notifyCustomer("cust_1", MESSAGE);

    expect(mockedTransport.send).toHaveBeenCalledWith(
      {
        endpoint: "https://push.example/phone",
        keys: { p256dh: "p256dh", auth: "auth" },
      },
      MESSAGE,
    );
  });

  it("does nothing at all when push is not configured", async () => {
    Object.defineProperty(mockedTransport, "isConfigured", {
      value: false,
      configurable: true,
    });

    await pushService.notifyCustomer("cust_1", MESSAGE);

    expect(mockedRepo.findByCustomerId).not.toHaveBeenCalled();
    expect(mockedTransport.send).not.toHaveBeenCalled();
  });

  it("skips the fan-out when the customer has no devices", async () => {
    mockedRepo.findByCustomerId.mockResolvedValue([]);

    await pushService.notifyCustomer("cust_1", MESSAGE);

    expect(mockedTransport.send).not.toHaveBeenCalled();
  });
});

describe("subscriptions the push service says are gone", () => {
  it("deletes them", async () => {
    mockedRepo.findByCustomerId.mockResolvedValue([
      subscription("https://push.example/dead"),
    ] as never);
    mockedTransport.send.mockResolvedValue("gone");

    await pushService.notifyCustomer("cust_1", MESSAGE);

    expect(mockedRepo.deleteByEndpoints).toHaveBeenCalledWith([
      "https://push.example/dead",
    ]);
  });

  it("deletes only the gone ones, leaving the live devices alone", async () => {
    mockedRepo.findByCustomerId.mockResolvedValue([
      subscription("https://push.example/live"),
      subscription("https://push.example/dead"),
    ] as never);
    mockedTransport.send
      .mockResolvedValueOnce("sent")
      .mockResolvedValueOnce("gone");

    await pushService.notifyCustomer("cust_1", MESSAGE);

    expect(mockedRepo.deleteByEndpoints).toHaveBeenCalledWith([
      "https://push.example/dead",
    ]);
  });

  it("keeps a subscription whose push merely failed", async () => {
    mockedRepo.findByCustomerId.mockResolvedValue([
      subscription("https://push.example/flaky"),
    ] as never);
    mockedTransport.send.mockResolvedValue("failed");

    await pushService.notifyCustomer("cust_1", MESSAGE);

    expect(mockedRepo.deleteByEndpoints).not.toHaveBeenCalled();
  });

  it("touches the database only when there is something to prune", async () => {
    mockedRepo.findByCustomerId.mockResolvedValue([
      subscription("https://push.example/live"),
    ] as never);

    await pushService.notifyCustomer("cust_1", MESSAGE);

    expect(mockedRepo.deleteByEndpoints).not.toHaveBeenCalled();
  });

  it("does not let one device's failure stop the others", async () => {
    mockedRepo.findByCustomerId.mockResolvedValue([
      subscription("https://push.example/a"),
      subscription("https://push.example/b"),
      subscription("https://push.example/c"),
    ] as never);
    mockedTransport.send
      .mockResolvedValueOnce("failed")
      .mockResolvedValueOnce("sent")
      .mockResolvedValueOnce("sent");

    await pushService.notifyCustomer("cust_1", MESSAGE);

    expect(mockedTransport.send).toHaveBeenCalledTimes(3);
  });
});

describe("registering and removing a browser", () => {
  it("upserts, so a browser re-subscribing does not double up", async () => {
    mockedRepo.upsertSubscription.mockResolvedValue(
      subscription("https://push.example/phone") as never,
    );

    await pushService.subscribe(
      "cust_1",
      {
        endpoint: "https://push.example/phone",
        keys: { p256dh: "k", auth: "a" },
      },
      "Firefox/1.0",
    );

    expect(mockedRepo.upsertSubscription).toHaveBeenCalledWith({
      customerId: "cust_1",
      endpoint: "https://push.example/phone",
      p256dh: "k",
      auth: "a",
      userAgent: "Firefox/1.0",
    });
  });

  it("never returns the subscription keys", async () => {
    mockedRepo.upsertSubscription.mockResolvedValue(
      subscription("https://push.example/phone") as never,
    );

    const result = await pushService.subscribe(
      "cust_1",
      {
        endpoint: "https://push.example/phone",
        keys: { p256dh: "secret-p256dh", auth: "secret-auth" },
      },
      undefined,
    );

    expect(JSON.stringify(result)).not.toContain("p256dh");
    expect(JSON.stringify(result)).not.toContain("auth");
  });

  it("404s an unsubscribe that removed nothing", async () => {
    mockedRepo.deleteForCustomer.mockResolvedValue(false);

    await expect(
      pushService.unsubscribe("cust_1", "https://push.example/theirs"),
    ).rejects.toMatchObject({
      message: pushErrors.SUBSCRIPTION_NOT_FOUND.message,
      statusCode: 404,
    });
  });

  it("scopes the removal to the caller", async () => {
    mockedRepo.deleteForCustomer.mockResolvedValue(true);

    await pushService.unsubscribe("cust_1", "https://push.example/mine");

    expect(mockedRepo.deleteForCustomer).toHaveBeenCalledWith(
      "cust_1",
      "https://push.example/mine",
    );
  });
});

describe("the public key endpoint", () => {
  it("returns the key when push is on", () => {
    expect(pushService.publicKey()).toBe("test-public-key");
  });

  it("404s when push is off rather than returning nothing", () => {
    Object.defineProperty(mockedTransport, "publicKey", {
      value: null,
      configurable: true,
    });

    expect(() => pushService.publicKey()).toThrowError(
      pushErrors.PUSH_NOT_CONFIGURED.message,
    );

    Object.defineProperty(mockedTransport, "publicKey", {
      value: "test-public-key",
      configurable: true,
    });
  });
});
