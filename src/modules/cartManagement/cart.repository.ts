import prisma from '../../../lib/prisma';

export class Cart {
  static async getCarts() {
    const carts = await prisma.cart.findMany();
    console.log(carts);
  }
}
