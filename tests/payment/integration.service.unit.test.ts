import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/prisma", () => ({
  default: {
    paymentIntegrationType: { findFirst: vi.fn(), findMany: vi.fn() },
  },
}));

import prisma from "../../src/config/prisma";
import { paymentIntegrationService } from "../../src/modules/payment/integration.service";
import { paymentErrors } from "../../src/shared/exceptions/payment.errors";

const mockedPrisma = vi.mocked(prisma, true);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("whether a method may be used right now", () => {
  it("allows one whose integration is enabled", async () => {
    mockedPrisma.paymentIntegrationType.findFirst.mockResolvedValue({
      isEnabled: true,
    } as never);

    expect(await paymentIntegrationService.isMethodEnabled("CASH")).toBe(true);
  });

  it("refuses one whose integration has been switched off", async () => {
    mockedPrisma.paymentIntegrationType.findFirst.mockResolvedValue({
      isEnabled: false,
    } as never);

    expect(await paymentIntegrationService.isMethodEnabled("CREDIT_CARD")).toBe(
      false,
    );
  });

  it("allows one the table says nothing about", async () => {
    mockedPrisma.paymentIntegrationType.findFirst.mockResolvedValue(null);

    expect(await paymentIntegrationService.isMethodEnabled("CASH")).toBe(true);
  });

  it("looks the row up by payment method, not by guessing a code", async () => {
    mockedPrisma.paymentIntegrationType.findFirst.mockResolvedValue(null);

    await paymentIntegrationService.isMethodEnabled("CREDIT_CARD");

    expect(mockedPrisma.paymentIntegrationType.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { paymentMethod: "CREDIT_CARD" } }),
    );
  });
});

describe("the assertion the payment path makes", () => {
  it("passes silently when the integration is enabled", async () => {
    mockedPrisma.paymentIntegrationType.findFirst.mockResolvedValue({
      isEnabled: true,
    } as never);

    await expect(
      paymentIntegrationService.assertMethodEnabled("CASH"),
    ).resolves.toBeUndefined();
  });

  it("throws the same 400 an unsupported method gets", async () => {
    mockedPrisma.paymentIntegrationType.findFirst.mockResolvedValue({
      isEnabled: false,
    } as never);

    await expect(
      paymentIntegrationService.assertMethodEnabled("CREDIT_CARD"),
    ).rejects.toMatchObject({
      message: paymentErrors.UNSUPPORTED_METHOD.message,
      statusCode: 400,
    });
  });
});
