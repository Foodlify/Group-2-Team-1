/**
 * Address Service — unit tests (default-address rules).
 *
 * The repository is mocked so each test asserts pure service logic —
 * "IF the repository returns X, THEN the service does Y" — with no database.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/address/address.repository", () => ({
  addressRepository: {
    findById: vi.fn(),
    findByCustomerId: vi.fn(),
    countByCustomerId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    setDefault: vi.fn(),
    deleteAndReassignDefault: vi.fn(),
  },
}));

import { addressService } from "../../src/modules/address/address.service";
import { addressRepository } from "../../src/modules/address/address.repository";
import { customerErrors } from "../../src/shared/exceptions/customer.errors";

const mocked = vi.mocked(addressRepository);

const now = new Date("2026-08-06T10:00:00.000Z");
const addressRow = {
  id: "addr_1",
  customerId: "cust_1",
  addressLine1: "12 Tahrir St",
  addressLine2: null,
  city: "Cairo",
  postalCode: "11511",
  country: "Egypt",
  isDefault: true,
  createdAt: now,
  updatedAt: now,
};

const createInput = {
  addressLine1: "12 Tahrir St",
  city: "Cairo",
  postalCode: "11511",
  country: "Egypt",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("create", () => {
  it("makes the customer's first address the default automatically", async () => {
    mocked.countByCustomerId.mockResolvedValue(0);
    mocked.create.mockResolvedValue(addressRow);

    const result = await addressService.create("cust_1", createInput);

    expect(mocked.create).toHaveBeenCalledWith({
      data: { ...createInput, customerId: "cust_1", isDefault: true },
    });
    expect(result.isDefault).toBe(true);
  });

  it("creates later addresses as non-default", async () => {
    mocked.countByCustomerId.mockResolvedValue(2);
    mocked.create.mockResolvedValue({
      ...addressRow,
      id: "addr_3",
      isDefault: false,
    });

    const result = await addressService.create("cust_1", createInput);

    expect(mocked.create).toHaveBeenCalledWith({
      data: { ...createInput, customerId: "cust_1", isDefault: false },
    });
    expect(result.isDefault).toBe(false);
  });
});

describe("setDefault", () => {
  it("re-points the default after asserting ownership", async () => {
    const target = { ...addressRow, id: "addr_2", isDefault: false };
    mocked.findById.mockResolvedValue(target);
    mocked.setDefault.mockResolvedValue({ ...target, isDefault: true });

    const result = await addressService.setDefault("cust_1", "addr_2");

    expect(mocked.setDefault).toHaveBeenCalledWith("cust_1", "addr_2");
    expect(result.isDefault).toBe(true);
  });

  it("throws 404 when the address does not exist", async () => {
    mocked.findById.mockResolvedValue(null);

    await expect(
      addressService.setDefault("cust_1", "nope"),
    ).rejects.toMatchObject({
      statusCode: customerErrors.ADDRESS_NOT_FOUND.statusCode,
    });
    expect(mocked.setDefault).not.toHaveBeenCalled();
  });

  it("throws 403 when the address belongs to another customer", async () => {
    mocked.findById.mockResolvedValue({
      ...addressRow,
      customerId: "someone_else",
    });

    await expect(
      addressService.setDefault("cust_1", "addr_1"),
    ).rejects.toMatchObject({
      statusCode: customerErrors.ADDRESS_FORBIDDEN.statusCode,
    });
    expect(mocked.setDefault).not.toHaveBeenCalled();
  });
});

describe("remove", () => {
  it("tells the repository whether the deleted address was the default", async () => {
    mocked.findById.mockResolvedValue(addressRow); // isDefault: true
    mocked.deleteAndReassignDefault.mockResolvedValue(undefined);

    await addressService.remove("cust_1", "addr_1");

    expect(mocked.deleteAndReassignDefault).toHaveBeenCalledWith(
      "cust_1",
      "addr_1",
      true,
    );
  });

  it("passes wasDefault=false for a non-default address", async () => {
    mocked.findById.mockResolvedValue({ ...addressRow, isDefault: false });
    mocked.deleteAndReassignDefault.mockResolvedValue(undefined);

    await addressService.remove("cust_1", "addr_1");

    expect(mocked.deleteAndReassignDefault).toHaveBeenCalledWith(
      "cust_1",
      "addr_1",
      false,
    );
  });
});
