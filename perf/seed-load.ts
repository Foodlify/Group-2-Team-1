/**
 * Seeds the database for the JMeter load tests and writes the CSV files the
 * test plans read.
 *
 * Every virtual user needs its own account: replaying one login 500 times
 * measures a cache, not the system. So this creates N independent customers,
 * each with an address, and emits `perf/data/users.csv` for JMeter's CSV Data
 * Set Config to hand one row to each thread.
 *
 * Run with the load database selected:
 *   DATABASE_URL=... npx ts-node perf/seed-load.ts
 */
import fs from "node:fs";
import path from "node:path";
import prisma from "../src/config/prisma";
import { hashPassword } from "../src/shared/auth/password.helper";
import { signAccessToken } from "../src/shared/auth/jwt.helper";

const USER_COUNT = Number(process.env.LOAD_USERS ?? 500);
const PASSWORD = "LoadTest123!";
/** Effectively unlimited — the baseline plan must not hit stock limits. */
const AMPLE_STOCK = 1_000_000;
/** Deliberately scarce, for the contention plan. */
const SCARCE_STOCK = Number(process.env.LOAD_SCARCE_STOCK ?? 50);

const dataDir = path.join(__dirname, "data");

async function main(): Promise<void> {
  const started = Date.now();
  console.log(`Seeding ${USER_COUNT} load-test customers...`);

  // Wipe first: the plans assume a known starting stock, and a re-run against
  // leftover rows would silently change what the numbers mean.
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

  // bcrypt is intentionally slow — hashing 500 times would dominate this
  // script's runtime for no benefit, since every account shares one password.
  const passwordHash = await hashPassword(PASSWORD);

  // Tokens are minted here rather than obtained by logging in from JMeter.
  // That is a deliberate test-design decision, not a shortcut: bcrypt at cost
  // 12 costs ~250ms of *blocking* CPU per login in `bcryptjs` (pure JS, no
  // thread pool), so 500 simultaneous logins demand ~125 seconds of
  // single-threaded CPU. A plan that logs in first measures bcrypt and tells
  // you nothing about the cart or the order path. Login capacity is measured
  // separately — see docs/LOAD_TESTING.md.
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
            // Login is blocked until the email is verified, so these are
            // pre-verified rather than driving the OTP flow under load.
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
  // The plans read the item ids from here rather than hard-coding cuids that
  // change on every seed.
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
