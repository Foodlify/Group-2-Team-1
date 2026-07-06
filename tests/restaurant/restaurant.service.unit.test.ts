// ═══════════════════════════════════════════════════════════════
// Restaurant Service — Unit Tests
// ═══════════════════════════════════════════════════════════════
//
// WHAT IS A UNIT TEST?
// A unit test checks ONE function/method in isolation.
// We replace ("mock") all external dependencies (database, APIs)
// with fake implementations so we ONLY test the service logic.
//
// WHY MOCK?
// - Real database = slow tests, need running PostgreSQL
// - Mocked database = instant tests, no external dependencies
// - We test: "IF the database returns X, THEN the service does Y"
//
// ═══════════════════════════════════════════════════════════════

// ─── IMPORTS ──────────────────────────────────────────────────
// We don't need to import `describe`, `it`, `expect`, `vi`
// because we set `globals: true` in vitest.config.ts.
// They are available globally in every test file.

// `vi` is Vitest's object for mocking.
// It provides: vi.fn() (fake functions), vi.mock() (fake modules)
import { vi, describe, it, expect, beforeEach } from "vitest";

// ─── MOCKING MODULES ──────────────────────────────────────────
// `vi.mock(path)` replaces a module with a fake version.
// When the service imports "./restaurant.repository", it gets
// our fake instead of the real one.
//
// The factory function returns an object matching the shape
// of the real module's exports, but with vi.fn() stubs.
vi.mock("../../src/modules/restaurant/restaurant.repository", () => ({
  // `restaurantRepository` is what the service imports
  restaurantRepository: {
    // `findFirst` — the service calls this to check if a restaurant exists
    // vi.fn() creates a fake function we can control in each test
    findFirst: vi.fn(),
    // `create` — the service calls this to create a new restaurant
    create: vi.fn(),
    // `update` — the service calls this to update a restaurant
    update: vi.fn(),
  },
}));

// Mock the Prisma client (used directly by getOrders and updateOrderStatus)
vi.mock("../../src/config/prisma", () => ({
  // `default` — because the service does: import prisma from "../../config/prisma"
  default: {
    order: {
      // `findMany` — the service calls this to get orders
      findMany: vi.fn(),
    },
    orderStatus: {
      // `upsert` — the service calls this to create/update order status
      upsert: vi.fn(),
    },
  },
}));

// ─── IMPORTS AFTER MOCKING ────────────────────────────────────
// IMPORTANT: We import the service AFTER vi.mock() calls.
// Vitest hoists vi.mock() to the top of the file automatically,
// so by the time this import runs, the mocks are already in place.
// The service will receive our fake repository and prisma.

import { restaurantService } from "../../src/modules/restaurant/restaurant.service";
import { restaurantRepository } from "../../src/modules/restaurant/restaurant.repository";
import prisma from "../../src/config/prisma";
import { AppError } from "../../src/middlewares/error.middleware";

// ─── TEST DATA FIXTURES ───────────────────────────────────────
// These are fake data objects that we'll use across tests.
// They match the shape of real database records.

const mockOwnerId = "owner-123";
const mockRestaurantId = "rest-456";

// This simulates what the database would return for a restaurant
const mockRestaurant = {
  id: mockRestaurantId,
  name: "My Cafe",
  ownerId: mockOwnerId,
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
};

// This simulates the input the user sends in the request body
const mockRegisterInput = { name: "My Cafe" };
const mockUpdateInput = { name: "Updated Cafe" };

// ─── describe() BLOCK ─────────────────────────────────────────
// `describe()` groups related tests together.
// Think of it as a "folder" for tests about the same thing.
//
// Syntax: describe("name of the group", () => { ... })
// The name appears in test output so you know which group ran.

describe("restaurantService", () => {

  // ─── beforeEach() ─────────────────────────────────────────
  // `beforeEach()` runs BEFORE EVERY test in this describe block.
  // We use it to clear mock call history between tests.
  //
  // WHY? If test A calls restaurantRepository.findFirst(),
  // and test B also calls it, test B would see test A's call
  // recorded. clearAllMocks() resets the call counts.
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── NESTED describe() ──────────────────────────────────
  // We group tests by method name for clarity.
  describe("register", () => {

    // ─── TEST CASE ───────────────────────────────────────────
    // `it()` defines a single test case.
    //
    // Syntax: it("description of what we expect", async () => { ... })
    //
    // The description should read like a sentence:
    // "it should create a restaurant when owner has none"
    //
    // We use `async` because the service methods are async
    // (they return Promises).
    it("should create a restaurant when owner has none", async () => {
      // ── ARRANGE ──────────────────────────────────────────
      // Set up the mocks to return specific values.
      //
      // `vi.mocked(restaurantRepository.findFirst)` — tells TypeScript
      // that this vi.fn() should be treated as the real findFirst method.
      //
      // `.mockResolvedValue(null)` — when findFirst is called,
      // it will return a Promise that resolves to `null`.
      //
      // WHY null? Because `null` means "no restaurant found",
      // which is the happy path for registration.
      vi.mocked(restaurantRepository.findFirst).mockResolvedValue(null as any);

      // `.mockResolvedValue(mockRestaurant)` — when create is called,
      // it returns the fake restaurant object we defined above.
      vi.mocked(restaurantRepository.create).mockResolvedValue(mockRestaurant as any);

      // ── ACT ──────────────────────────────────────────────
      // Call the actual service method with our test data.
      const result = await restaurantService.register(mockOwnerId, mockRegisterInput);

      // ── ASSERT ───────────────────────────────────────────
      // `expect()` is the assertion function. It wraps a value
      // and chains with matcher methods.
      //
      // `expect(result).toEqual(mockRestaurant)` — checks that
      // the result deep-equals our mock restaurant.
      // `toEqual` checks all properties, not just reference equality.
      expect(result).toEqual(mockRestaurant);

      // `expect(restaurantRepository.findFirst).toHaveBeenCalledWith(...)`
      // — checks that findFirst was called with specific arguments.
      // This verifies the service is querying correctly.
      expect(restaurantRepository.findFirst).toHaveBeenCalledWith({
        where: { ownerId: mockOwnerId },
      });

      // `expect(restaurantRepository.create).toHaveBeenCalledWith(...)`
      // — checks that create was called with the right data.
      expect(restaurantRepository.create).toHaveBeenCalledWith({
        data: { name: mockRegisterInput.name, ownerId: mockOwnerId },
      });
    });

    // ─── TEST CASE ───────────────────────────────────────────
    // This tests the ERROR path: owner already has a restaurant.
    it("should throw 409 if owner already has a restaurant", async () => {
      // ARRANGE: findFirst returns an existing restaurant (not null)
      vi.mocked(restaurantRepository.findFirst).mockResolvedValue(mockRestaurant as any);

      // ACT & ASSERT in one line:
      // `expect(async () => ...).rejects.toThrow(AppError)` is the pattern
      // for testing that an async function throws an error.
      //
      // `.rejects` — because the function returns a Promise
      // `.toThrow(AppError)` — the Promise should reject with AppError
      await expect(
        restaurantService.register(mockOwnerId, mockRegisterInput)
      ).rejects.toThrow(AppError);

      // Also verify that `create` was NEVER called.
      // `not` inverts the assertion — we expect it was NOT called.
      expect(restaurantRepository.create).not.toHaveBeenCalled();
    });
  });

  // ─── Tests for getMyRestaurant ─────────────────────────────
  describe("getMyRestaurant", () => {

    it("should return restaurant when found", async () => {
      // ARRANGE: findFirst returns a restaurant
      vi.mocked(restaurantRepository.findFirst).mockResolvedValue(mockRestaurant as any);

      // ACT: call the service
      const result = await restaurantService.getMyRestaurant(mockOwnerId);

      // ASSERT: result matches the mock
      expect(result).toEqual(mockRestaurant);
      expect(restaurantRepository.findFirst).toHaveBeenCalledWith({
        where: { ownerId: mockOwnerId },
      });
    });

    it("should throw 404 when restaurant not found", async () => {
      // ARRANGE: findFirst returns null (no restaurant)
      vi.mocked(restaurantRepository.findFirst).mockResolvedValue(null as any);

      // ACT & ASSERT: should throw AppError
      await expect(
        restaurantService.getMyRestaurant(mockOwnerId)
      ).rejects.toThrow(AppError);
    });
  });

  // ─── Tests for updateMyRestaurant ──────────────────────────
  describe("updateMyRestaurant", () => {

    it("should update restaurant name successfully", async () => {
      // ARRANGE
      // findFirst returns an object with just `id` (because service uses `select: { id: true }`)
      vi.mocked(restaurantRepository.findFirst).mockResolvedValue({ id: mockRestaurantId } as any);
      // update returns the updated restaurant
      vi.mocked(restaurantRepository.update).mockResolvedValue({
        ...mockRestaurant,
        name: mockUpdateInput.name,
      } as any);

      // ACT
      const result = await restaurantService.updateMyRestaurant(mockOwnerId, mockUpdateInput);

      // ASSERT
      expect(result.name).toBe(mockUpdateInput.name);
      expect(restaurantRepository.update).toHaveBeenCalledWith({
        where: { id: mockRestaurantId },
        data: { name: mockUpdateInput.name },
      });
    });

    it("should throw 404 when restaurant not found", async () => {
      // ARRANGE: findFirst returns null
      vi.mocked(restaurantRepository.findFirst).mockResolvedValue(null as any);

      // ACT & ASSERT
      await expect(
        restaurantService.updateMyRestaurant(mockOwnerId, mockUpdateInput)
      ).rejects.toThrow(AppError);
    });
  });

  // ─── Tests for getOrders ───────────────────────────────────
  describe("getOrders", () => {

    it("should return orders for the restaurant", async () => {
      // ARRANGE
      vi.mocked(restaurantRepository.findFirst).mockResolvedValue({ id: mockRestaurantId } as any);

      const mockOrders = [
        {
          id: "order-1",
          orderDate: new Date("2025-01-15"),
          address: { street: "123 Main St" },
          status: { status: "delivered" },
        },
      ];
      vi.mocked(prisma.order.findMany).mockResolvedValue(mockOrders as any);

      // ACT
      const result = await restaurantService.getOrders(mockOwnerId);

      // ASSERT
      expect(result).toEqual(mockOrders);
      // Verify the Prisma query was called with correct structure
      expect(prisma.order.findMany).toHaveBeenCalledWith({
        where: {
          items: {
            some: {
              menuItem: {
                menu: { restaurantId: mockRestaurantId },
              },
            },
          },
        },
        include: {
          address: true,
          status: true,
        },
        orderBy: { orderDate: "asc" },
      });
    });

    it("should throw 404 when restaurant not found", async () => {
      // ARRANGE
      vi.mocked(restaurantRepository.findFirst).mockResolvedValue(null as any);

      // ACT & ASSERT
      await expect(
        restaurantService.getOrders(mockOwnerId)
      ).rejects.toThrow(AppError);
    });
  });

  // ─── Tests for updateOrderStatus ───────────────────────────
  describe("updateOrderStatus", () => {

    it("should upsert order status successfully", async () => {
      // ARRANGE
      vi.mocked(restaurantRepository.findFirst).mockResolvedValue({ id: mockRestaurantId } as any);

      const mockOrderStatus = {
        orderId: "order-1",
        status: "preparing",
        updatedAt: new Date(),
      };
      vi.mocked(prisma.orderStatus.upsert).mockResolvedValue(mockOrderStatus as any);

      // ACT
      const result = await restaurantService.updateOrderStatus(
        mockOwnerId,
        "order-1",
        "preparing"
      );

      // ASSERT
      expect(result).toEqual(mockOrderStatus);
      expect(prisma.orderStatus.upsert).toHaveBeenCalledWith({
        where: { orderId: "order-1" },
        create: { orderId: "order-1", status: "preparing" },
        update: { status: "preparing" },
      });
    });

    it("should throw 404 when restaurant not found", async () => {
      // ARRANGE
      vi.mocked(restaurantRepository.findFirst).mockResolvedValue(null as any);

      // ACT & ASSERT
      await expect(
        restaurantService.updateOrderStatus(mockOwnerId, "order-1", "preparing")
      ).rejects.toThrow(AppError);
    });
  });
});
