import { afterAll, beforeEach, describe, expect, it } from "vitest";
import prisma from "../../src/config/prisma";
import { disconnect, resetDatabase } from "./helpers/db";
import { api, asCookie, createAccount } from "./helpers/http";

const details = {
  phone: "+201000000000",
  email: "hello@koshary.example",
  description: "Koshary since 1998.",
  addressLine1: "12 Tahrir St",
  addressLine2: "Floor 2",
  city: "Cairo",
  postalCode: "11511",
  country: "Egypt",
};

let adminToken: string;

const createRestaurant = async (body: Record<string, unknown>) => {
  const res = await api()
    .post("/api/v1/restaurants")
    .set("Cookie", asCookie(adminToken))
    .send(body);
  expect(res.status).toBe(201);
  return res.body.data;
};

beforeEach(async () => {
  await resetDatabase();
  ({ token: adminToken } = await createAccount("ADMIN"));
});

afterAll(async () => {
  await disconnect();
});

describe("registering a restaurant with its details", () => {
  it("stores both and returns them", async () => {
    const created = await createRestaurant({ name: "Koshary", details });

    expect(created.details).toEqual(details);
    expect(await prisma.restaurantDetails.count()).toBe(1);
  });

  it("reads them back on the single-restaurant endpoint", async () => {
    const created = await createRestaurant({ name: "Koshary", details });

    const res = await api().get(`/api/v1/restaurants/${created.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.details).toEqual(details);
  });

  it("registers one without details at all", async () => {
    const created = await createRestaurant({ name: "Bare" });

    expect(created.details).toBeNull();
    expect(await prisma.restaurantDetails.count()).toBe(0);
  });

  it("rejects details missing a required field, and stores no restaurant", async () => {
    const res = await api()
      .post("/api/v1/restaurants")
      .set("Cookie", asCookie(adminToken))
      .send({ name: "Half", details: { phone: "+2010", city: "Cairo" } });

    expect(res.status).toBe(400);

    expect(await prisma.restaurant.count()).toBe(0);
  });
});

describe("adding and changing details later", () => {
  it("adds them to a restaurant that had none", async () => {
    const created = await createRestaurant({ name: "Bare" });

    const res = await api()
      .patch(`/api/v1/restaurants/${created.id}`)
      .set("Cookie", asCookie(adminToken))
      .send({ details });

    expect(res.status).toBe(200);
    expect(res.body.data.details).toEqual(details);
  });

  it("leaves the name untouched when only details were sent", async () => {
    const created = await createRestaurant({ name: "Bare" });

    await api()
      .patch(`/api/v1/restaurants/${created.id}`)
      .set("Cookie", asCookie(adminToken))
      .send({ details });

    const row = await prisma.restaurant.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(row.name).toBe("Bare");
  });

  it("replaces them rather than merging into them", async () => {
    const created = await createRestaurant({ name: "Koshary", details });

    const res = await api()
      .patch(`/api/v1/restaurants/${created.id}`)
      .set("Cookie", asCookie(adminToken))
      .send({
        details: {
          phone: "+201111111111",
          addressLine1: "1 New St",
          city: "Giza",
          postalCode: "12611",
          country: "Egypt",
        },
      });

    expect(res.body.data.details).toEqual({
      phone: "+201111111111",
      email: null,
      description: null,
      addressLine1: "1 New St",
      addressLine2: null,
      city: "Giza",
      postalCode: "12611",
      country: "Egypt",
    });
  });

  it("keeps them when only the name is changed", async () => {
    const created = await createRestaurant({ name: "Koshary", details });

    const res = await api()
      .patch(`/api/v1/restaurants/${created.id}`)
      .set("Cookie", asCookie(adminToken))
      .send({ name: "Koshary El Tahrir" });

    expect(res.body.data.name).toBe("Koshary El Tahrir");
    expect(res.body.data.details).toEqual(details);
  });

  it("never creates a second details row for one restaurant", async () => {
    const created = await createRestaurant({ name: "Koshary", details });

    for (const city of ["Giza", "Alexandria", "Cairo"]) {
      await api()
        .patch(`/api/v1/restaurants/${created.id}`)
        .set("Cookie", asCookie(adminToken))
        .send({ details: { ...details, city } });
    }

    expect(await prisma.restaurantDetails.count()).toBe(1);
    const row = await prisma.restaurantDetails.findFirstOrThrow();
    expect(row.city).toBe("Cairo");
  });

  it("400s an empty update instead of reporting a no-op as applied", async () => {
    const created = await createRestaurant({ name: "Koshary", details });

    const res = await api()
      .patch(`/api/v1/restaurants/${created.id}`)
      .set("Cookie", asCookie(adminToken))
      .send({});

    expect(res.status).toBe(400);
  });

  it("403s a customer trying to change them", async () => {
    const created = await createRestaurant({ name: "Koshary", details });
    const { token } = await createAccount("CUSTOMER");

    const res = await api()
      .patch(`/api/v1/restaurants/${created.id}`)
      .set("Cookie", asCookie(token))
      .send({ details });

    expect(res.status).toBe(403);
  });

  it("404s a soft-deleted restaurant", async () => {
    const created = await createRestaurant({ name: "Koshary", details });
    await api()
      .delete(`/api/v1/restaurants/${created.id}`)
      .set("Cookie", asCookie(adminToken));

    const res = await api()
      .patch(`/api/v1/restaurants/${created.id}`)
      .set("Cookie", asCookie(adminToken))
      .send({ details });

    expect(res.status).toBe(404);
  });
});

describe("what the listing carries", () => {
  it("leaves details out of the paginated list", async () => {
    await createRestaurant({ name: "Koshary", details });

    const res = await api().get("/api/v1/restaurants");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);

    expect(res.body.data[0]).not.toHaveProperty("details");
  });
});

describe("the details row's lifetime", () => {
  it("survives a soft delete, because the restaurant's rows stay put", async () => {
    const created = await createRestaurant({ name: "Koshary", details });

    await api()
      .delete(`/api/v1/restaurants/${created.id}`)
      .set("Cookie", asCookie(adminToken));

    expect(await prisma.restaurantDetails.count()).toBe(1);
  });

  it("comes back with the restaurant on restore", async () => {
    const created = await createRestaurant({ name: "Koshary", details });
    await api()
      .delete(`/api/v1/restaurants/${created.id}`)
      .set("Cookie", asCookie(adminToken));

    const res = await api()
      .patch(`/api/v1/restaurants/${created.id}/restore`)
      .set("Cookie", asCookie(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.data.details).toEqual(details);
  });

  it("is removed by the database when the restaurant row really goes", async () => {
    const created = await createRestaurant({ name: "Koshary", details });

    await prisma.restaurant.delete({ where: { id: created.id } });

    expect(await prisma.restaurantDetails.count()).toBe(0);
  });
});
