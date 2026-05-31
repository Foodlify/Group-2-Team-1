import prisma from "../src/config/prisma";
import logger from "../src/config/logger";
import { hashPassword } from "../src/shared/auth/password.helper";

/**
 * Seeds the database with the minimum data needed for cart testing:
 * - 1 User
 * - 1 Customer (linked to the user)
 * - 1 Restaurant
 * - 1 Menu
 * - 3 MenuItems
 *
 * Safe to run multiple times — uses upsert on stable identifiers.
 */
const seed = async (): Promise<void> => {
  logger.info("🌱 Starting seed...");

  // ─── Test User (CUSTOMER) ───────────────────────────
  const customerPasswordHash = await hashPassword("Password123!");
  const testUser = await prisma.user.upsert({
    where: { email: "test@example.com" },
    update: { password: customerPasswordHash },
    create: {
      email: "test@example.com",
      name: "Test User",
      password: customerPasswordHash,
      role: "CUSTOMER",
    },
  });

  // ─── Customer (1:1 with User) ───────────────────────
  const testCustomer = await prisma.customer.upsert({
    where: { userId: testUser.id },
    update: {},
    create: { userId: testUser.id, phone: "+201000000000" },
  });

  // ─── Admin User (for dashboard auth testing) ────────
  const adminPasswordHash = await hashPassword("Admin123!");
  const adminUser = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: { password: adminPasswordHash, role: "ADMIN" },
    create: {
      email: "admin@example.com",
      name: "Admin User",
      password: adminPasswordHash,
      role: "ADMIN",
    },
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
    customerId: testCustomer.id,
    userId: testUser.id,
    userEmail: testUser.email,
    customerLogin: { email: "test@example.com", password: "Password123!" },
    adminUserId: adminUser.id,
    adminLogin: { email: "admin@example.com", password: "Admin123!" },
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
