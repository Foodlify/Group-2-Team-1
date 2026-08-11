import prisma from "../config/prisma";
import logger from "../config/logger";
import env from "../config/env";
import { hashPassword } from "../shared/auth/password.helper";

interface SeedAccount {
  email: string;
  password: string;
}

const DEVELOPMENT_ADMIN: SeedAccount = {
  email: "admin@example.com",
  password: "Admin123!",
};

const DEVELOPMENT_CUSTOMER: SeedAccount = {
  email: "test@example.com",
  password: "Password123!",
};

const accountFromEnvironment = (
  role: "ADMIN" | "CUSTOMER",
  email: string | undefined,
  password: string | undefined,
  developmentFallback: SeedAccount,
): SeedAccount => {
  if (email && password) return { email, password };

  const emailVar = `SEED_${role}_EMAIL`;
  const passwordVar = `SEED_${role}_PASSWORD`;

  if (email || password) {
    throw new Error(`${emailVar} and ${passwordVar} must be set together`);
  }

  if (env.NODE_ENV === "production") {
    throw new Error(
      `Refusing to seed a ${role} with the credentials published in this repository. ` +
        `Set ${emailVar} and ${passwordVar} to values that are not in version control.`,
    );
  }

  return developmentFallback;
};

const upsertVerifiedUser = async (
  account: SeedAccount,
  name: string,
  role: "ADMIN" | "CUSTOMER",
) => {
  const password = await hashPassword(account.password);
  const emailVerifiedAt = new Date();
  return prisma.user.upsert({
    where: { email: account.email },
    update: { password, role, emailVerifiedAt },
    create: { email: account.email, name, password, role, emailVerifiedAt },
  });
};

const CATALOGUE_ITEMS = [
  { name: "Margherita Pizza", price: 12.99 },
  { name: "Pepperoni Pizza", price: 14.99 },
  { name: "Caesar Salad", price: 8.5 },
];

const seed = async (): Promise<void> => {
  const adminAccount = accountFromEnvironment(
    "ADMIN",
    env.SEED_ADMIN_EMAIL,
    env.SEED_ADMIN_PASSWORD,
    DEVELOPMENT_ADMIN,
  );
  const customerAccount = accountFromEnvironment(
    "CUSTOMER",
    env.SEED_CUSTOMER_EMAIL,
    env.SEED_CUSTOMER_PASSWORD,
    DEVELOPMENT_CUSTOMER,
  );

  logger.info("Seeding started", { environment: env.NODE_ENV });

  const adminUser = await upsertVerifiedUser(
    adminAccount,
    "Admin User",
    "ADMIN",
  );

  const customerUser = await upsertVerifiedUser(
    customerAccount,
    "Test User",
    "CUSTOMER",
  );

  const customer = await prisma.customer.upsert({
    where: { userId: customerUser.id },
    update: {},
    create: { userId: customerUser.id, phone: "+201000000000" },
  });

  const existingAddress = await prisma.address.findFirst({
    where: { customerId: customer.id },
  });
  const address =
    existingAddress ??
    (await prisma.address.create({
      data: {
        customerId: customer.id,
        addressLine1: "12 Tahrir St",
        city: "Cairo",
        postalCode: "11511",
        country: "Egypt",
      },
    }));

  const existingRestaurant = await prisma.restaurant.findFirst({
    where: { name: "Pizza Place" },
  });
  const restaurant =
    existingRestaurant ??
    (await prisma.restaurant.create({ data: { name: "Pizza Place" } }));

  const existingMenu = await prisma.menu.findFirst({
    where: { restaurantId: restaurant.id },
  });
  const menu =
    existingMenu ??
    (await prisma.menu.create({
      data: { name: "Breakfast", restaurantId: restaurant.id },
    }));

  for (const item of CATALOGUE_ITEMS) {
    const existing = await prisma.menuItem.findFirst({
      where: { menuId: menu.id, name: item.name },
    });
    if (!existing) {
      await prisma.menuItem.create({ data: { ...item, menuId: menu.id } });
    }
  }

  const menuItems = await prisma.menuItem.findMany({
    where: { menuId: menu.id },
  });

  logger.info("Seeding complete", {
    adminEmail: adminUser.email,
    customerEmail: customerUser.email,
    addressId: address.id,
    restaurantId: restaurant.id,
    menuItems: menuItems.map((m) => ({ id: m.id, name: m.name })),
  });
};

seed()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    logger.error("Seeding failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    await prisma.$disconnect();
    process.exit(1);
  });
