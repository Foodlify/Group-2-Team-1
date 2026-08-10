import type { PrismaClient } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";

export class UserRepository extends BaseRepository<PrismaClient["user"]> {
  constructor() {
    super(prisma.user);
  }

  async findById(id: string) {
    return this.findUnique({ where: { id } });
  }

  async findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  }

  async findByGoogleId(googleId: string) {
    return prisma.user.findUnique({ where: { googleId } });
  }

  /** Attaches a Google identity to an account that already exists. */
  async linkGoogleId(id: string, googleId: string) {
    return prisma.user.update({ where: { id }, data: { googleId } });
  }

  /**
   * Creates a customer account from a Google identity.
   *
   * No password and no phone — Google supplies neither, and inventing either
   * would put made-up data in a place that matters (an unusable hash claiming
   * to be a password; a fabricated number on a delivery record). The customer
   * adds a phone through `PATCH /customers/me`.
   *
   * `emailVerifiedAt` is set here rather than left for an OTP: Google has
   * already proved the address belongs to them, and the caller only reaches
   * this after checking the `email_verified` claim. Mailing a code to confirm
   * what is already confirmed would be theatre.
   */
  async createGoogleCustomerUser(data: {
    name: string;
    email: string;
    googleId: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: data.name,
          email: data.email,
          googleId: data.googleId,
          role: "CUSTOMER",
          emailVerifiedAt: new Date(),
        },
      });
      await tx.customer.create({ data: { userId: user.id } });
      return user;
    });
  }

  /** True if a customer already uses this (unique) phone. */
  async phoneExists(phone: string): Promise<boolean> {
    const found = await prisma.customer.findUnique({
      where: { phone },
      select: { id: true },
    });
    return found !== null;
  }

  /** Stamps email ownership as proven (idempotent by the caller's check). */
  async markEmailVerified(id: string) {
    return this.update({
      where: { id },
      data: { emailVerifiedAt: new Date() },
    });
  }

  /** Enable / disable an account (admin) or self-deactivate (customer). */
  async setActive(id: string, isActive: boolean) {
    return this.update({ where: { id }, data: { isActive } });
  }

  /** Newest-first paginated list with total count. */
  async listPaginated(page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      prisma.user.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.count(),
    ]);
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Creates a CUSTOMER user together with its 1:1 Customer row in a single
   * transaction — both succeed or both roll back.
   */
  async createCustomerUser(data: {
    name: string;
    email: string;
    password: string;
    phone: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: data.name,
          email: data.email,
          password: data.password,
          role: "CUSTOMER",
        },
      });
      await tx.customer.create({
        data: { userId: user.id, phone: data.phone },
      });
      return user;
    });
  }
}

export const userRepository = new UserRepository();
