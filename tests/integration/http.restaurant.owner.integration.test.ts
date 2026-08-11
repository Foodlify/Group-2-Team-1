import { afterAll, beforeEach, describe, expect, it } from "vitest";
import prisma from "../../src/config/prisma";
import { orderService } from "../../src/modules/order/order.service";
import {
  createCartWithItem,
  createCatalog,
  createCustomer,
  disconnect,
  resetDatabase,
} from "./helpers/db";
import { api, asCookie, createAccount } from "./helpers/http";

const twoRestaurants = async () => {
  const { user: owner, token: ownerToken } = await createAccount("RESTAURANT", {
    suffix: "owner",
  });
  const mine = await createCatalog({
    price: "30.00",
    name: "Mine",
    ownerId: owner.id,
  });
  const theirs = await createCatalog({ price: "40.00", name: "Theirs" });

  const placeAgainst = async (
    restaurantId: string,
    menuItem: { id: string; name: string; price: never },
    suffix: string,
  ) => {
    const { customer, address } = await createCustomer(suffix);
    await createCartWithItem(customer.id, restaurantId, menuItem, 1);
    return orderService.placeOrder(customer.id, {
      addressId: address.id,
      paymentMethod: "CASH",
    });
  };

  const myOrder = await placeAgainst(
    mine.restaurant.id,
    mine.menuItem as never,
    "1",
  );
  const theirOrder = await placeAgainst(
    theirs.restaurant.id,
    theirs.menuItem as never,
    "2",
  );

  return { owner, ownerToken, mine, theirs, myOrder, theirOrder };
};

let adminToken: string;

beforeEach(async () => {
  await resetDatabase();
  ({ token: adminToken } = await createAccount("ADMIN"));
});

afterAll(async () => {
  await disconnect();
});

describe("assigning an owner", () => {
  it("hands a restaurant to a RESTAURANT-role account", async () => {
    const { restaurant } = await createCatalog();
    const { user } = await createAccount("RESTAURANT", { suffix: "o1" });

    const res = await api()
      .patch(`/api/v1/restaurants/${restaurant.id}/owner`)
      .set("Cookie", asCookie(adminToken))
      .send({ ownerId: user.id });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      restaurantId: restaurant.id,
      ownerId: user.id,
    });
  });

  it("400s an account that is not a restaurant", async () => {
    const { restaurant } = await createCatalog();
    const { user } = await createAccount("CUSTOMER", { suffix: "c1" });

    const res = await api()
      .patch(`/api/v1/restaurants/${restaurant.id}/owner`)
      .set("Cookie", asCookie(adminToken))
      .send({ ownerId: user.id });

    expect(res.status).toBe(400);
    const row = await prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurant.id },
    });
    expect(row.ownerId).toBeNull();
  });

  it("takes ownership back with an explicit null", async () => {
    const { user } = await createAccount("RESTAURANT", { suffix: "o2" });
    const { restaurant } = await createCatalog({ ownerId: user.id });

    const res = await api()
      .patch(`/api/v1/restaurants/${restaurant.id}/owner`)
      .set("Cookie", asCookie(adminToken))
      .send({ ownerId: null });

    expect(res.status).toBe(200);
    expect(res.body.data.ownerId).toBeNull();
  });

  it("400s an empty body rather than reading it as an unassign", async () => {
    const { user } = await createAccount("RESTAURANT", { suffix: "o3" });
    const { restaurant } = await createCatalog({ ownerId: user.id });

    const res = await api()
      .patch(`/api/v1/restaurants/${restaurant.id}/owner`)
      .set("Cookie", asCookie(adminToken))
      .send({});

    expect(res.status).toBe(400);
    const row = await prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurant.id },
    });
    expect(row.ownerId).toBe(user.id);
  });

  it("404s a user id that matches no account", async () => {
    const { restaurant } = await createCatalog();

    const res = await api()
      .patch(`/api/v1/restaurants/${restaurant.id}/owner`)
      .set("Cookie", asCookie(adminToken))
      .send({ ownerId: "clnobodyatallxxxxxxxxxxxx" });

    expect(res.status).toBe(404);
  });

  it("403s a restaurant owner trying to assign ownership", async () => {
    const { user, token } = await createAccount("RESTAURANT", {
      suffix: "o4",
    });
    const { restaurant } = await createCatalog({ ownerId: user.id });

    const res = await api()
      .patch(`/api/v1/restaurants/${restaurant.id}/owner`)
      .set("Cookie", asCookie(token))
      .send({ ownerId: user.id });

    expect(res.status).toBe(403);
  });

  it("keeps the owner id out of the public restaurant read", async () => {
    const { user } = await createAccount("RESTAURANT", { suffix: "o5" });
    const { restaurant } = await createCatalog({ ownerId: user.id });

    const res = await api().get(`/api/v1/restaurants/${restaurant.id}`);

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(user.id);
  });
});

describe("Restaurants Order History", () => {
  it("returns the owner's orders and not the other restaurant's", async () => {
    const { ownerToken, myOrder, theirOrder } = await twoRestaurants();

    const res = await api()
      .get("/api/v1/restaurants/me/orders")
      .set("Cookie", asCookie(ownerToken));

    expect(res.status).toBe(200);
    expect(res.body.data.map((o: { id: string }) => o.id)).toEqual([
      myOrder.id,
    ]);
    expect(JSON.stringify(res.body)).not.toContain(theirOrder.id);
  });

  it("owns the /restaurants/{x}/orders namespace — nothing else answers there", async () => {
    const { ownerToken, mine } = await twoRestaurants();

    const byId = await api()
      .get(`/api/v1/restaurants/${mine.restaurant.id}/orders`)
      .set("Cookie", asCookie(adminToken));
    const byMe = await api()
      .get("/api/v1/restaurants/me/orders")
      .set("Cookie", asCookie(ownerToken));

    expect(byId.status).toBe(404);
    expect(byMe.status).toBe(200);
  });

  it("refuses a demoted ex-owner whose ownership row still stands", async () => {
    const { owner, ownerToken, myOrder } = await twoRestaurants();

    await prisma.user.update({
      where: { id: owner.id },
      data: { role: "CUSTOMER" },
    });

    const res = await api()
      .patch(`/api/v1/orders/${myOrder.id}/status`)
      .set("Cookie", asCookie(ownerToken))
      .send({ status: "CANCELLED" });

    expect(res.status).toBe(403);
  });

  it("gives an owner who runs no restaurant an empty page, not the platform", async () => {
    await twoRestaurants();
    const { token } = await createAccount("RESTAURANT", { suffix: "idle" });

    const res = await api()
      .get("/api/v1/restaurants/me/orders")
      .set("Cookie", asCookie(token));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(0);
  });

  it("takes effect on the next request when an admin reassigns", async () => {
    const { owner, ownerToken, theirs } = await twoRestaurants();

    await api()
      .patch(`/api/v1/restaurants/${theirs.restaurant.id}/owner`)
      .set("Cookie", asCookie(adminToken))
      .send({ ownerId: owner.id });

    const res = await api()
      .get("/api/v1/restaurants/me/orders")
      .set("Cookie", asCookie(ownerToken));

    expect(res.body.data).toHaveLength(2);
  });

  it("drops a restaurant from the owner's scope once it is deleted", async () => {
    const { ownerToken, mine } = await twoRestaurants();

    await api()
      .delete(`/api/v1/restaurants/${mine.restaurant.id}`)
      .set("Cookie", asCookie(adminToken));

    const res = await api()
      .get("/api/v1/restaurants/me/orders")
      .set("Cookie", asCookie(ownerToken));

    expect(res.body.data).toEqual([]);
  });

  it("filters by status like every other order listing", async () => {
    const { ownerToken } = await twoRestaurants();

    const res = await api()
      .get("/api/v1/restaurants/me/orders?status=DELIVERED")
      .set("Cookie", asCookie(ownerToken));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("403s a customer and 403s an admin", async () => {
    await twoRestaurants();
    const { token: customerToken } = await createAccount("CUSTOMER", {
      suffix: "shopper",
    });

    const asCustomer = await api()
      .get("/api/v1/restaurants/me/orders")
      .set("Cookie", asCookie(customerToken));
    const asAdmin = await api()
      .get("/api/v1/restaurants/me/orders")
      .set("Cookie", asCookie(adminToken));

    expect(asCustomer.status).toBe(403);

    expect(asAdmin.status).toBe(403);
  });

  it("401s an anonymous caller", async () => {
    const res = await api().get("/api/v1/restaurants/me/orders");
    expect(res.status).toBe(401);
  });
});

describe("one order, read by the restaurant that has to cook it", () => {
  it("returns it with its items", async () => {
    const { ownerToken, myOrder } = await twoRestaurants();

    const res = await api()
      .get(`/api/v1/restaurants/me/orders/${myOrder.id}`)
      .set("Cookie", asCookie(ownerToken));

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
  });

  it("403s another restaurant's order", async () => {
    const { ownerToken, theirOrder } = await twoRestaurants();

    const res = await api()
      .get(`/api/v1/restaurants/me/orders/${theirOrder.id}`)
      .set("Cookie", asCookie(ownerToken));

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("This order does not belong to you");
  });
});

describe("Cancelled Orders by Customers or Restaurants", () => {
  it("lets a restaurant cancel its own order", async () => {
    const { ownerToken, myOrder } = await twoRestaurants();

    const res = await api()
      .patch(`/api/v1/orders/${myOrder.id}/status`)
      .set("Cookie", asCookie(ownerToken))
      .send({ status: "CANCELLED" });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("CANCELLED");
  });

  it("settles the money through the same path a customer's cancellation uses", async () => {
    const { ownerToken, myOrder } = await twoRestaurants();

    await api()
      .patch(`/api/v1/orders/${myOrder.id}/status`)
      .set("Cookie", asCookie(ownerToken))
      .send({ status: "CANCELLED" });

    const payments = await prisma.transaction.findMany({
      where: { orderId: myOrder.id, type: "ORDER_PAYMENT" },
    });
    expect(payments).toHaveLength(1);
    expect(payments[0]!.status).toBe("FAILED");
  });

  it("lets a restaurant advance its own order's status", async () => {
    const { ownerToken, myOrder } = await twoRestaurants();

    const res = await api()
      .patch(`/api/v1/orders/${myOrder.id}/status`)
      .set("Cookie", asCookie(ownerToken))
      .send({ status: "CONFIRMED" });

    expect(res.status).toBe(200);
  });

  it("403s a restaurant touching another restaurant's order", async () => {
    const { ownerToken, theirOrder } = await twoRestaurants();

    const res = await api()
      .patch(`/api/v1/orders/${theirOrder.id}/status`)
      .set("Cookie", asCookie(ownerToken))
      .send({ status: "CANCELLED" });

    expect(res.status).toBe(403);
    const after = await prisma.order.findUniqueOrThrow({
      where: { id: theirOrder.id },
    });
    expect(after.status).toBe("PENDING");
  });

  it("still lets an admin act on any restaurant's order", async () => {
    const { theirOrder } = await twoRestaurants();

    const res = await api()
      .patch(`/api/v1/orders/${theirOrder.id}/status`)
      .set("Cookie", asCookie(adminToken))
      .send({ status: "CONFIRMED" });

    expect(res.status).toBe(200);
  });

  it("stops a customer at the door, not deep inside the handler", async () => {
    const { myOrder } = await twoRestaurants();
    const { token } = await createAccount("CUSTOMER", { suffix: "nosy" });

    const res = await api()
      .patch(`/api/v1/orders/${myOrder.id}/status`)
      .set("Cookie", asCookie(token))
      .send({ status: "CANCELLED" });

    expect(res.status).toBe(403);

    expect(res.body.message).toBe("Not authorized");
  });
});

describe("the admin's restaurant filter", () => {
  it("narrows the platform-wide listing to one restaurant", async () => {
    const { mine, myOrder } = await twoRestaurants();

    const res = await api()
      .get(`/api/v1/orders/admin?restaurantId=${mine.restaurant.id}`)
      .set("Cookie", asCookie(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.data.map((o: { id: string }) => o.id)).toEqual([
      myOrder.id,
    ]);
  });

  it("returns everything when no restaurant is named", async () => {
    await twoRestaurants();

    const res = await api()
      .get("/api/v1/orders/admin")
      .set("Cookie", asCookie(adminToken));

    expect(res.body.data).toHaveLength(2);
  });
});

describe("what happens to a restaurant when its owner's account goes", () => {
  it("survives, unowned, rather than being deleted with the account", async () => {
    const { owner, mine, myOrder } = await twoRestaurants();

    await prisma.user.delete({ where: { id: owner.id } });

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: mine.restaurant.id },
    });
    expect(restaurant?.ownerId).toBeNull();
    expect(await prisma.order.count({ where: { id: myOrder.id } })).toBe(1);
  });
});
