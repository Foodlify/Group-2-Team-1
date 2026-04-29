import prisma from "../src/config/prisma";
import logger from "../src/config/logger";

/**
 * Seeds the database with the minimum data needed for cart testing:
 * - 1 UserType (Customer)
 * - 1 User
 * - 1 Customer (linked to the user)
 * - 1 Restaurant + RestaurantDetails
 * - 1 Menu
 * - 3 MenuItems
 *
 * Safe to run multiple times — uses upsert on stable identifiers.
 */
const seed = async (): Promise<void> => {
  logger.info("🌱 Starting seed...");

  // // ─── UserType ───────────────────────────────────────
  // const customerType = await prisma.userType.upsert({
  //   where: { name: "Customer" },
  //   update: {},
  //   create: { name: "Customer" },
  // });

  // ─── Test User ──────────────────────────────────────
  const testUser = await prisma.user.upsert({
    where: { email: "test@example.com" },
    update: {},
    create: {
      email: "test@example.com",
      name: "Test User",
    },
  });

  // ─── Customer (1:1 with User) ───────────────────────
  await prisma.customer.upsert({
    where: { userId: testUser.id },
    update: {},
    create: { userId: testUser.id },
  });

  // ─── Restaurant ─────────────────────────────────────
  // Restaurant.name is not unique, so we find-or-create manually
  let restaurant = await prisma.restaurant.findFirst({
    where: { name: "Pizza Place" },
  });
  if (!restaurant) {
    restaurant = await prisma.restaurant.create({
      data: {
        name: "Pizza Place",
      },
    });
  }

  // ─── Menu ───────────────────────────────────────────
  let menu = await prisma.menu.findFirst({
    where: { restaurantId: restaurant.id },
  });
  if (!menu) {
    menu = await prisma.menu.create({
      data: { name: "Breakfast", restaurantId: restaurant.id },
    });
  }

  // ─── Menu Items ─────────────────────────────────────
  const itemsToCreate = [
    { name: "Margherita Pizza", price: 12.99 },
    { name: "Pepperoni Pizza", price: 14.99 },
    { name: "Caesar Salad", price: 8.5 },
  ];

  for (const item of itemsToCreate) {
    const existing = await prisma.menuItem.findFirst({
      where: { menuId: menu.id, name: item.name },
    });
    if (!existing) {
      await prisma.menuItem.create({
        data: { ...item, menuId: menu.id },
      });
    }
  }

  const menuItems = await prisma.menuItem.findMany({
    where: { menuId: menu.id },
  });

  logger.info("✅ Seed complete", {
    userId: testUser.id,
    userEmail: testUser.email,
    menuItemIds: menuItems.map((m) => ({ id: m.id, name: m.name })),
  });
};

seed()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    logger.error("Seed failed", { error });
    await prisma.$disconnect();
    process.exit(1);
  });
