import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";

/** See `menuItem.repository` — same rule: every read hides soft-deleted rows. */
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

  /** Restore is the only caller that legitimately wants a deleted row. */
  async findByIdIncludingDeleted(id: string) {
    return this.findUnique({ where: { id } });
  }

  /**
   * One restaurant with its details joined. Separate from `findById` so the
   * join happens on the single-restaurant read and nowhere else — the listing,
   * the cart and the order paths all keep loading the narrow row.
   */
  async findByIdWithDetails(id: string) {
    return prisma.restaurant.findFirst({
      where: { id, ...notDeleted },
      include: { details: true },
    });
  }

  /**
   * Writes the details, creating the row or replacing it.
   *
   * An upsert rather than a create-or-update pair: "has this restaurant got
   * details yet" is a question the database can answer atomically and the
   * application cannot — two concurrent PATCHes that both read "no details"
   * would both insert, and the unique index would fail the second one.
   */
  async upsertDetails(
    restaurantId: string,
    data: Prisma.RestaurantDetailsCreateWithoutRestaurantInput,
    tx?: Prisma.TransactionClient,
  ) {
    return (tx ?? prisma).restaurantDetails.upsert({
      where: { restaurantId },
      create: { ...data, restaurantId },
      // Spread over the whole row so a field left out of the payload is
      // cleared rather than kept: the payload is a replacement, and silently
      // retaining an old address line would be the worst of both readings.
      update: {
        ...data,
        email: data.email ?? null,
        description: data.description ?? null,
        addressLine2: data.addressLine2 ?? null,
      },
    });
  }

  /**
   * Paginated list with optional case-insensitive name search.
   * `includeDeleted` is honoured for admins only — see `restaurant.service`.
   */
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

  /**
   * Transaction-aware create and update. `BaseRepository` provides both, but
   * neither takes a client — and these two now run alongside a details write
   * that has to commit or roll back with them.
   */
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

  // ─── Soft delete ──────────────────────────────────────
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
