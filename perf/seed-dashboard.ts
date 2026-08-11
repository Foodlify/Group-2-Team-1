import fs from "node:fs";
import path from "node:path";
import prisma from "../src/config/prisma";
import { hashPassword } from "../src/shared/auth/password.helper";
import { signAccessToken } from "../src/shared/auth/jwt.helper";
import { Prisma } from "../src/generated/prisma/client";

const ORDER_COUNT = Number(process.env.DASH_ORDERS ?? 50_000);
const DAYS = Number(process.env.DASH_DAYS ?? 90);
const BATCH = 5_000;

const dataDir = path.join(__dirname, "data");

const rng = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

async function main(): Promise<void> {
  const started = Date.now();

  const [restaurant, customer] = await Promise.all([
    prisma.restaurant.findFirst({ where: { isDeleted: false } }),
    prisma.customer.findFirst(),
  ]);
  if (!restaurant || !customer) {
    console.error("Run `npm run perf:seed` first — no restaurant or customer.");
    process.exit(1);
  }

  const address = await prisma.address.findFirst({
    where: { customerId: customer.id },
  });
  if (!address) {
    console.error("The seeded customer has no address.");
    process.exit(1);
  }

  console.log(
    `Seeding ${ORDER_COUNT} historical orders across ${DAYS} days...`,
  );

  const random = rng(42);
  const now = Date.now();
  const spanMs = DAYS * 24 * 60 * 60 * 1000;
  const STATUSES = [
    "DELIVERED",
    "DELIVERED",
    "DELIVERED",
    "CANCELLED",
    "PENDING",
  ] as const;

  let written = 0;
  for (let start = 0; start < ORDER_COUNT; start += BATCH) {
    const size = Math.min(BATCH, ORDER_COUNT - start);
    const orders = [];
    const transactions = [];

    for (let i = 0; i < size; i++) {
      const n = start + i;

      const at = new Date(now - Math.floor(random() * spanMs));
      const amount = new Prisma.Decimal(
        (10 + Math.floor(random() * 90)).toFixed(2),
      );
      const status = STATUSES[Math.floor(random() * STATUSES.length)]!;
      const orderId = `perford${String(n).padStart(10, "0")}`;

      orders.push({
        id: orderId,
        customerId: customer.id,
        addressId: address.id,
        restaurantId: restaurant.id,
        status,
        totalAmount: amount,
        orderDate: at,
        createdAt: at,
        updatedAt: at,
        timeline: [],
      });

      transactions.push({
        id: `perftxn${String(n).padStart(10, "0")}`,
        orderId,
        internalTxNumber: `PERF-${n}`,
        type: "ORDER_PAYMENT" as const,

        status: (status === "CANCELLED" ? "FAILED" : "SUCCESS") as
          | "FAILED"
          | "SUCCESS",
        paymentMethod: "CASH" as const,
        amount,
        currency: "EGP",
        createdAt: at,
        updatedAt: at,
      });
    }

    await prisma.order.createMany({ data: orders, skipDuplicates: true });
    await prisma.transaction.createMany({
      data: transactions,
      skipDuplicates: true,
    });
    written += size;
    process.stdout.write(`\r  ${written}/${ORDER_COUNT}`);
  }
  process.stdout.write("\n");

  const admin = await prisma.user.upsert({
    where: { email: "perf-admin@example.com" },
    update: { role: "ADMIN" },
    create: {
      name: "Perf Admin",
      email: "perf-admin@example.com",
      password: await hashPassword("LoadTest123!"),
      role: "ADMIN",
      emailVerifiedAt: new Date(),
    },
  });

  const token = signAccessToken({
    id: admin.id,
    email: admin.email,
    role: admin.role,
  });

  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(
    path.join(dataDir, "dashboard.csv"),
    `adminToken,restaurantId\n${token},${restaurant.id}\n`,
  );

  const [orderTotal, txnTotal] = await Promise.all([
    prisma.order.count(),
    prisma.transaction.count(),
  ]);

  console.log(
    `Done in ${((Date.now() - started) / 1000).toFixed(1)}s — ` +
      `${orderTotal} orders, ${txnTotal} transactions in the database`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
