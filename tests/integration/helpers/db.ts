import prisma from "../../../src/config/prisma";
import { Prisma } from "../../../src/generated/prisma/client";

/**
 * Empties every table between tests.
 *
 * The table list is read from the database rather than hard-coded, so a new
 * model can never quietly leak rows into the next test — the failure mode of a
 * hand-maintained list is a test that passes because of data it didn't create.
 * `_prisma_migrations` is kept: dropping it would make `migrate deploy` replay
 * everything on the next run.
 */
export async function resetDatabase(): Promise<void> {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
  );
}

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}

// ─── Fixtures ────────────────────────────────────────────
// Deliberately built through Prisma rather than raw SQL, so every fixture also
// exercises the schema's defaults, constraints and relations.

export async function createCustomer(suffix = "1") {
  const user = await prisma.user.create({
    data: {
      name: `Customer ${suffix}`,
      email: `customer${suffix}@example.com`,
      password: "hashed-not-used-here",
      emailVerifiedAt: new Date(),
    },
  });
  const customer = await prisma.customer.create({
    data: { userId: user.id, phone: `0100000${suffix.padStart(4, "0")}` },
  });
  const address = await prisma.address.create({
    data: {
      customerId: customer.id,
      addressLine1: "1 Test Street",
      city: "Cairo",
      postalCode: "11511",
      country: "EG",
      isDefault: true,
    },
  });
  return { user, customer, address };
}

/**
 * A restaurant with one menu and one item, priced and optionally stocked.
 *
 * `name` matters once a test needs two restaurants: the column is not unique,
 * so two identically named ones are legal but indistinguishable in a failure
 * message. `ownerId` is the account that runs it — left null, as every
 * restaurant was before ownership existed.
 */
export async function createCatalog(
  options: {
    price?: string;
    stock?: number | null;
    name?: string;
    ownerId?: string;
  } = {},
) {
  const restaurant = await prisma.restaurant.create({
    data: {
      name: options.name ?? "Koshary El Tahrir",
      ...(options.ownerId ? { ownerId: options.ownerId } : {}),
    },
  });
  const menu = await prisma.menu.create({
    data: { name: "Dinner", restaurantId: restaurant.id },
  });
  const menuItem = await prisma.menuItem.create({
    data: {
      menuId: menu.id,
      name: "Koshary",
      price: new Prisma.Decimal(options.price ?? "30.00"),
      stock: options.stock ?? null,
    },
  });
  return { restaurant, menu, menuItem };
}

/** A cart for `customerId` holding `quantity` of `menuItem`. */
export async function createCartWithItem(
  customerId: string,
  restaurantId: string,
  menuItem: { id: string; name: string; price: Prisma.Decimal },
  quantity = 1,
) {
  const cart = await prisma.cart.create({ data: { customerId, restaurantId } });
  await prisma.cartItem.create({
    data: {
      cartId: cart.id,
      menuItemId: menuItem.id,
      quantity,
      price: menuItem.price,
      name: menuItem.name,
    },
  });
  return cart;
}
