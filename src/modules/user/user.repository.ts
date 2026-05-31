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

  /** True if a customer already uses this (unique) phone. */
  async phoneExists(phone: string): Promise<boolean> {
    const found = await prisma.customer.findUnique({
      where: { phone },
      select: { id: true },
    });
    return found !== null;
  }

  async updateRefreshToken(id: string, token: string | null) {
    return prisma.user.update({ where: { id }, data: { refreshToken: token } });
  }

  /** Newest-first paginated list with total count. */
  async listPaginated(page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      prisma.user.findMany({ skip, take: limit, orderBy: { createdAt: "desc" } }),
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
