import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";

const notDeleted = { isDeleted: false } as const;

export class RestaurantRepository extends BaseRepository<
  PrismaClient["restaurant"]
> {
  constructor() {
    super(prisma.restaurant);
  }

  async findById(id: string) {
    return prisma.restaurant.findFirst({ where: { id, ...notDeleted } });
  }

  async findByIdIncludingDeleted(id: string) {
    return this.findUnique({ where: { id } });
  }

  async findByIdWithDetails(id: string) {
    return prisma.restaurant.findFirst({
      where: { id, ...notDeleted },
      include: { details: true },
    });
  }

  async upsertDetails(
    restaurantId: string,
    data: Prisma.RestaurantDetailsCreateWithoutRestaurantInput,
    tx?: Prisma.TransactionClient,
  ) {
    return (tx ?? prisma).restaurantDetails.upsert({
      where: { restaurantId },
      create: { ...data, restaurantId },

      update: {
        ...data,
        email: data.email ?? null,
        description: data.description ?? null,
        addressLine2: data.addressLine2 ?? null,
      },
    });
  }

  async findIdsByOwnerId(ownerId: string): Promise<string[]> {
    const rows = await prisma.restaurant.findMany({
      where: { ownerId, ...notDeleted },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  async isOwnedBy(id: string, ownerId: string): Promise<boolean> {
    const count = await prisma.restaurant.count({
      where: { id, ownerId, ...notDeleted },
    });
    return count > 0;
  }

  async setOwner(id: string, ownerId: string | null, actorId: string) {
    return prisma.restaurant.update({
      where: { id },
      data: { ownerId, updatedBy: actorId },
    });
  }

  async listPaginated(
    page: number,
    limit: number,
    search?: string,
    includeDeleted = false,
  ) {
    const where: Prisma.RestaurantWhereInput = {
      ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
      ...(includeDeleted ? {} : notDeleted),
    };
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      prisma.restaurant.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: "asc" },
      }),
      prisma.restaurant.count({ where }),
    ]);
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async createRestaurant(
    data: Prisma.RestaurantCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    return (tx ?? prisma).restaurant.create({ data });
  }

  async updateById(
    id: string,
    data: Prisma.RestaurantUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    return (tx ?? prisma).restaurant.update({ where: { id }, data });
  }

  async softDeleteById(
    id: string,
    actorId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await (tx ?? prisma).restaurant.update({
      where: { id },
      data: { isDeleted: true, updatedBy: actorId },
    });
  }

  async restoreById(
    id: string,
    actorId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await (tx ?? prisma).restaurant.update({
      where: { id },
      data: { isDeleted: false, updatedBy: actorId },
    });
  }
}

export const restaurantRepository = new RestaurantRepository();
