import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/cart/cart.repository", () => ({
  cartRepository: {
    deleteAbandoned: vi.fn(),
  },
}));

vi.mock("../../src/config/env", () => ({
  default: {
    CART_GUEST_TTL_HOURS: 24,
    CART_CUSTOMER_TTL_DAYS: 30,
    CART_SWEEP_INTERVAL_MINUTES: 60,
  },
}));

import { cartService } from "../../src/modules/cart/cart.service";
import { cartRepository } from "../../src/modules/cart/cart.repository";

const mockedCarts = vi.mocked(cartRepository);

const now = new Date("2026-08-06T12:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("sweepAbandoned", () => {
  it("derives both cutoffs from the configured TTLs", async () => {
    mockedCarts.deleteAbandoned.mockResolvedValue(3);

    const result = await cartService.sweepAbandoned();

    expect(mockedCarts.deleteAbandoned).toHaveBeenCalledWith({
      guestBefore: new Date("2026-08-05T12:00:00.000Z"),

      customerBefore: new Date("2026-07-07T12:00:00.000Z"),
    });
    expect(result).toEqual({ deleted: 3 });
  });

  it("reports zero without failing when nothing is stale", async () => {
    mockedCarts.deleteAbandoned.mockResolvedValue(0);

    await expect(cartService.sweepAbandoned()).resolves.toEqual({ deleted: 0 });
  });
});
