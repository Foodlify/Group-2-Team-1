import prisma from "../config/prisma";

async function test() {
  const id = "cmogdqg070006f4ueel37ckj5";
  console.log("id", id);

  const item = await prisma.menuItem.findUnique({
    where: { id },
  });

  console.log("item", item);

  const allItems = await prisma.menuItem.findMany({
    take: 5,
  });

  const orders = await prisma.order.findMany({ take: 5 });
  console.log("orders", orders);

  // console.log("all items", allItems);
}

test().finally(() => prisma.$disconnect());
