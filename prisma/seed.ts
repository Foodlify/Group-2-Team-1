import prisma from "../lib/prisma";

async function main() {
  console.log('🌱 Seeding database...');

  // ─────────────────────────────────────────
  // Clean existing data (order matters for FK)
  // ─────────────────────────────────────────
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.menu.deleteMany();
  await prisma.restaurant.deleteMany();
  await prisma.user.deleteMany();

  // ─────────────────────────────────────────
  // USERS
  // ─────────────────────────────────────────
  const user1 = await prisma.user.create({
    data: { name: 'Alice Johnson', email: 'alice@foodlify.com' },
  });

  const user2 = await prisma.user.create({
    data: { name: 'Bob Smith', email: 'bob@foodlify.com' },
  });

  const user3 = await prisma.user.create({
    data: { name: 'Sara Ahmed', email: 'sara@foodlify.com' },
  });

  console.log('✅ Users seeded');

  // ─────────────────────────────────────────
  // CUSTOMERS  (1-to-1 with User)
  // ─────────────────────────────────────────
  await prisma.customer.createMany({
    data: [
      { userId: user1.id },
      { userId: user2.id },
      { userId: user3.id },
    ],
  });

  console.log('✅ Customers seeded');

  // ─────────────────────────────────────────
  // RESTAURANTS
  // ─────────────────────────────────────────
  const restaurant1 = await prisma.restaurant.create({
    data: { name: 'Burger Palace' },
  });

  const restaurant2 = await prisma.restaurant.create({
    data: { name: 'Pizza Heaven' },
  });

  const restaurant3 = await prisma.restaurant.create({
    data: { name: 'Sushi World' },
  });

  console.log('✅ Restaurants seeded');

  // ─────────────────────────────────────────
  // MENUS  (1 menu per restaurant)
  // ─────────────────────────────────────────
  const menu1 = await prisma.menu.create({
    data: { restaurantId: restaurant1.id },
  });

  const menu2 = await prisma.menu.create({
    data: { restaurantId: restaurant2.id },
  });

  const menu3 = await prisma.menu.create({
    data: { restaurantId: restaurant3.id },
  });

  console.log('✅ Menus seeded');

  // ─────────────────────────────────────────
  // MENU ITEMS
  // ─────────────────────────────────────────
  await prisma.menuItem.createMany({
    data: [
      // Burger Palace
      { menuId: menu1.id, itemName: 'Classic Burger',      price: 35 },
      { menuId: menu1.id, itemName: 'Cheese Burger',       price: 40 },
      { menuId: menu1.id, itemName: 'Crispy Chicken',      price: 38 },
      { menuId: menu1.id, itemName: 'French Fries',        price: 15 },

      // Pizza Heaven
      { menuId: menu2.id, itemName: 'Margherita Pizza',    price: 55 },
      { menuId: menu2.id, itemName: 'Pepperoni Pizza',     price: 65 },
      { menuId: menu2.id, itemName: 'BBQ Chicken Pizza',   price: 70 },
      { menuId: menu2.id, itemName: 'Garlic Bread',        price: 20 },

      // Sushi World
      { menuId: menu3.id, itemName: 'Salmon Roll',         price: 80 },
      { menuId: menu3.id, itemName: 'Tuna Nigiri (6 pcs)', price: 90 },
      { menuId: menu3.id, itemName: 'Veggie Roll',         price: 60 },
      { menuId: menu3.id, itemName: 'Miso Soup',           price: 25 },
    ],
  });

  console.log('✅ Menu items seeded');
  console.log('🎉 Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
