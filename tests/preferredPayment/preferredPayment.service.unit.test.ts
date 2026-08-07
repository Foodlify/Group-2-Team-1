/**
 * Preferred Payment Service — unit tests.
 *
 * The repository is mocked so each test asserts pure service logic —
 * "IF the repository returns X, THEN the service does Y" — with no database.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "../../src/modules/preferredPayment/preferredPayment.repository",
  () => ({
    preferredPaymentRepository: {
      findById: vi.fn(),
      findByCustomerId: vi.fn(),
      countByCustomerId: vi.fn(),
      create: vi.fn(),
      setDefault: vi.fn(),
      deleteAndReassignDefault: vi.fn(),
    },
  }),
);

import { preferredPaymentService } from "../../src/modules/preferredPayment/preferredPayment.service";
import { preferredPaymentRepository } from "../../src/modules/preferredPayment/preferredPayment.repository";
import { customerErrors } from "../../src/shared/exceptions/customer.errors";

const mocked = vi.mocked(preferredPaymentRepository);

const now = new Date("2026-08-06T10:00:00.000Z");
const settingRow = {
  id: "set_1",
  customerId: "cust_1",
  method: "CASH" as const,
  isDefault: true,
  createdAt: now,
  updatedAt: now,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("create", () => {
  it("makes the customer's first saved method the default automatically", async () => {
    mocked.countByCustomerId.mockResolvedValue(0);
    mocked.create.mockResolvedValue(settingRow);

    const result = await preferredPaymentService.create("cust_1", {
      method: "CASH",
    });

    expect(mocked.create).toHaveBeenCalledWith({
      data: { customerId: "cust_1", method: "CASH", isDefault: true },
    });
    expect(result.isDefault).toBe(true);
  });

  it("creates later settings as non-default", async () => {
    mocked.countByCustomerId.mockResolvedValue(1);
    mocked.create.mockResolvedValue({
      ...settingRow,
      id: "set_2",
      method: "WALLET",
      isDefault: false,
    });

    const result = await preferredPaymentService.create("cust_1", {
      method: "WALLET",
    });

    expect(mocked.create).toHaveBeenCalledWith({
      data: { customerId: "cust_1", method: "WALLET", isDefault: false },
    });
    expect(result.isDefault).toBe(false);
  });

  it("translates the DB unique violation into ALREADY_SAVED (409)", async () => {
    mocked.countByCustomerId.mockResolvedValue(1);
    // Shape matched by `isUniqueViolation` (Prisma P2002).
    mocked.create.mockRejectedValue({ code: "P2002" });

    await expect(
      preferredPaymentService.create("cust_1", { method: "CASH" }),
    ).rejects.toMatchObject({
      message: customerErrors.PAYMENT_METHOD_ALREADY_SAVED.message,
      statusCode: customerErrors.PAYMENT_METHOD_ALREADY_SAVED.statusCode,
    });
  });
});

describe("setDefault", () => {
  it("re-points the default after asserting ownership", async () => {
    const target = { ...settingRow, id: "set_2", isDefault: false };
    mocked.findById.mockResolvedValue(target);
    mocked.setDefault.mockResolvedValue({ ...target, isDefault: true });

    const result = await preferredPaymentService.setDefault("cust_1", "set_2");

    expect(mocked.setDefault).toHaveBeenCalledWith("cust_1", "set_2");
    expect(result.isDefault).toBe(true);
  });

  it("throws 404 when the setting does not exist", async () => {
    mocked.findById.mockResolvedValue(null);

    await expect(
      preferredPaymentService.setDefault("cust_1", "nope"),
    ).rejects.toMatchObject({
      statusCode: customerErrors.PAYMENT_SETTING_NOT_FOUND.statusCode,
    });
    expect(mocked.setDefault).not.toHaveBeenCalled();
  });

  it("throws 403 when the setting belongs to another customer", async () => {
    mocked.findById.mockResolvedValue({
      ...settingRow,
      customerId: "someone_else",
    });

    await expect(
      preferredPaymentService.setDefault("cust_1", "set_1"),
    ).rejects.toMatchObject({
      statusCode: customerErrors.PAYMENT_SETTING_FORBIDDEN.statusCode,
    });
    expect(mocked.setDefault).not.toHaveBeenCalled();
  });
});

describe("remove", () => {
  it("tells the repository whether the deleted setting was the default", async () => {
    mocked.findById.mockResolvedValue(settingRow); // isDefault: true
    mocked.deleteAndReassignDefault.mockResolvedValue(undefined);

    await preferredPaymentService.remove("cust_1", "set_1");

    expect(mocked.deleteAndReassignDefault).toHaveBeenCalledWith(
      "cust_1",
      "set_1",
      true,
    );
  });
});

describe("listByCustomer", () => {
  it("maps rows to responses", async () => {
    mocked.findByCustomerId.mockResolvedValue([settingRow]);

    const result = await preferredPaymentService.listByCustomer("cust_1");

    expect(result).toEqual([
      {
        id: "set_1",
        customerId: "cust_1",
        method: "CASH",
        isDefault: true,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    ]);
  });
});
