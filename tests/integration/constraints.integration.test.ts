import { afterAll, beforeEach, describe, expect, it } from "vitest";
import prisma from "../../src/config/prisma";
import {
  createCatalog,
  createCustomer,
  disconnect,
  resetDatabase,
} from "./helpers/db";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnect();
});

describe("Cart_single_owner_check", () => {
  it("rejects a cart owned by both a customer and a guest", async () => {
    const { customer } = await createCustomer();
    const { restaurant } = await createCatalog();

    await expect(
      prisma.cart.create({
        data: {
          customerId: customer.id,
          guestToken: "guest-token-1",
          restaurantId: restaurant.id,
        },
      }),
    ).rejects.toThrow(/Cart_single_owner_check|constraint/i);
  });

  it("rejects a cart owned by nobody", async () => {
    const { restaurant } = await createCatalog();

    await expect(
      prisma.cart.create({ data: { restaurantId: restaurant.id } }),
    ).rejects.toThrow(/Cart_single_owner_check|constraint/i);
  });

  it("accepts each owner on its own", async () => {
    const { customer } = await createCustomer();
    const { restaurant } = await createCatalog();

    await expect(
      prisma.cart.create({
        data: { customerId: customer.id, restaurantId: restaurant.id },
      }),
    ).resolves.toBeDefined();
    await expect(
      prisma.cart.create({
        data: { guestToken: "guest-token-1", restaurantId: restaurant.id },
      }),
    ).resolves.toBeDefined();
  });
});

describe("MenuItem stock check", () => {
  it("rejects negative stock", async () => {
    const { menu } = await createCatalog();

    await expect(
      prisma.menuItem.create({
        data: { menuId: menu.id, name: "Broken", price: "10", stock: -1 },
      }),
    ).rejects.toThrow(/stock|constraint/i);
  });

  it("rejects an update that would drive stock below zero", async () => {
    const { menuItem } = await createCatalog({ stock: 2 });

    await expect(
      prisma.menuItem.update({
        where: { id: menuItem.id },
        data: { stock: { decrement: 5 } },
      }),
    ).rejects.toThrow(/stock|constraint/i);
  });

  it("allows zero and null", async () => {
    const { menu } = await createCatalog();

    await expect(
      prisma.menuItem.create({
        data: { menuId: menu.id, name: "Sold out", price: "10", stock: 0 },
      }),
    ).resolves.toBeDefined();
    await expect(
      prisma.menuItem.create({
        data: { menuId: menu.id, name: "Untracked", price: "10", stock: null },
      }),
    ).resolves.toBeDefined();
  });
});

describe("uniqueness the services rely on instead of pre-checking", () => {
  it("allows only one rating per order", async () => {
    const { customer, address } = await createCustomer();
    const { restaurant } = await createCatalog();
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        addressId: address.id,
        restaurantId: restaurant.id,
        totalAmount: "60",
        status: "DELIVERED",
      },
    });
    const rate = {
      restaurantId: restaurant.id,
      orderId: order.id,
      customerId: customer.id,
      rating: 5,
    };

    await prisma.restaurantRate.create({ data: rate });

    await expect(
      prisma.restaurantRate.create({ data: { ...rate, rating: 1 } }),
    ).rejects.toThrow();
  });

  it("allows one line per menu item in a cart", async () => {
    const { customer } = await createCustomer();
    const { restaurant, menuItem } = await createCatalog();
    const cart = await prisma.cart.create({
      data: { customerId: customer.id, restaurantId: restaurant.id },
    });
    const line = {
      cartId: cart.id,
      menuItemId: menuItem.id,
      quantity: 1,
      price: menuItem.price,
      name: menuItem.name,
    };

    await prisma.cartItem.create({ data: line });
    await expect(prisma.cartItem.create({ data: line })).rejects.toThrow();
  });
});

describe("referential actions", () => {
  it("cascades a deleted customer down to their cart and its lines", async () => {
    const { user, customer } = await createCustomer();
    const { restaurant, menuItem } = await createCatalog();
    const cart = await prisma.cart.create({
      data: { customerId: customer.id, restaurantId: restaurant.id },
    });
    await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        menuItemId: menuItem.id,
        quantity: 1,
        price: menuItem.price,
        name: menuItem.name,
      },
    });

    await prisma.user.delete({ where: { id: user.id } });

    expect(await prisma.customer.count()).toBe(0);
    expect(await prisma.cart.count()).toBe(0);
    expect(await prisma.cartItem.count()).toBe(0);
  });

  it("refuses to hard-delete a menu item that an order references", async () => {
    const { customer, address } = await createCustomer();
    const { restaurant, menuItem } = await createCatalog();
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        addressId: address.id,
        restaurantId: restaurant.id,
        totalAmount: "30",
      },
    });
    await prisma.orderItems.create({
      data: {
        orderId: order.id,
        menuItemId: menuItem.id,
        quantity: 1,
        price: menuItem.price,
        name: menuItem.name,
      },
    });

    await expect(
      prisma.menuItem.delete({ where: { id: menuItem.id } }),
    ).rejects.toThrow();

    await expect(
      prisma.menuItem.update({
        where: { id: menuItem.id },
        data: { isDeleted: true },
      }),
    ).resolves.toBeDefined();
    expect(await prisma.orderItems.count()).toBe(1);
  });

  it("keeps a support ticket when its agent is deleted", async () => {
    const { customer } = await createCustomer();
    const agent = await prisma.customerServiceEmployee.create({
      data: { name: "Agent", section: "ORDER_ISSUE" },
    });
    await prisma.supportTicket.create({
      data: {
        requestId: "REQ-1",
        customerId: customer.id,
        category: "ORDER_ISSUE",
        subject: "Late",
        description: "Very late",
        assignedAgentId: agent.id,
      },
    });

    await prisma.customerServiceEmployee.delete({ where: { id: agent.id } });

    const ticket = await prisma.supportTicket.findFirst();
    expect(ticket).not.toBeNull();
    expect(ticket!.assignedAgentId).toBeNull();
  });
});
