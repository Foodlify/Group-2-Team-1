import fs from "node:fs";
import path from "node:path";
import prisma from "../src/config/prisma";
import { hashPassword } from "../src/shared/auth/password.helper";
import { signAccessToken } from "../src/shared/auth/jwt.helper";

const USER_COUNT = Number(process.env.LOAD_USERS ?? 500);
const PASSWORD = "LoadTest123!";

const AMPLE_STOCK = 1_000_000;

const SCARCE_STOCK = Number(process.env.LOAD_SCARCE_STOCK ?? 50);

const dataDir = path.join(__dirname, "data");

async function main(): Promise<void> {
  const started = Date.now();
  console.log(`Seeding ${USER_COUNT} load-test customers...`);

  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "Transaction", "OrderItems", "Order", "CartItem", "Cart",
      "RestaurantRate", "SupportTicket", "Address", "PreferredPaymentSetting",
      "Customer", "RefreshToken", "User", "MenuChangeLog", "MenuItem", "Menu",
      "Restaurant" RESTART IDENTITY CASCADE
  `);

  const restaurant = await prisma.restaurant.create({
    data: { name: "Load Test Kitchen" },
  });
  const menu = await prisma.menu.create({
    data: { name: "Load Menu", restaurantId: restaurant.id },
  });
  const [regular, scarce] = await Promise.all([
    prisma.menuItem.create({
      data: {
        menuId: menu.id,
        name: "Koshary",
        price: "30.00",
        stock: AMPLE_STOCK,
      },
    }),
    prisma.menuItem.create({
      data: {
        menuId: menu.id,
        name: "Limited Special",
        price: "45.50",
        stock: SCARCE_STOCK,
      },
    }),
  ]);

  const passwordHash = await hashPassword(PASSWORD);

  const rows: string[] = ["email,password,addressId,token"];
  const BATCH = 50;
  for (let start = 0; start < USER_COUNT; start += BATCH) {
    const batch = Array.from(
      { length: Math.min(BATCH, USER_COUNT - start) },
      (_, i) => start + i,
    );
    const created = await Promise.all(
      batch.map(async (i) => {
        const email = `load${i}@example.com`;
        const user = await prisma.user.create({
          data: {
            name: `Load User ${i}`,
            email,
            password: passwordHash,

            emailVerifiedAt: new Date(),
          },
        });
        const customer = await prisma.customer.create({
          data: { userId: user.id, phone: `0111${String(i).padStart(7, "0")}` },
        });
        const address = await prisma.address.create({
          data: {
            customerId: customer.id,
            addressLine1: `${i} Load Street`,
            city: "Cairo",
            postalCode: "11511",
            country: "EG",
            isDefault: true,
          },
        });
        const token = signAccessToken({
          id: user.id,
          email: user.email,
          role: user.role,
        });
        return `${email},${PASSWORD},${address.id},${token}`;
      }),
    );
    rows.push(...created);
    process.stdout.write(`\r  ${rows.length - 1}/${USER_COUNT} customers`);
  }
  process.stdout.write("\n");

  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, "users.csv"), rows.join("\n") + "\n");

  fs.writeFileSync(
    path.join(dataDir, "items.csv"),
    `regularItemId,scarceItemId,restaurantId\n${regular.id},${scarce.id},${restaurant.id}\n`,
  );

  console.log(
    `Done in ${((Date.now() - started) / 1000).toFixed(1)}s — ` +
      `${USER_COUNT} customers, regular stock ${AMPLE_STOCK}, scarce stock ${SCARCE_STOCK}`,
  );
  console.log(`  regular item: ${regular.id}`);
  console.log(`  scarce item:  ${scarce.id}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
