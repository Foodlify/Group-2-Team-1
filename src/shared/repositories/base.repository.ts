import type { PrismaClient, Prisma } from "../../generated/prisma/client";
import prisma from "../../config/prisma";

/**
 * Generic type helpers that extract argument and return types from any Prisma delegate.
 * These allow the BaseRepository to be fully type-safe without using `any`.
 */
type DelegateArg<
  TDelegate,
  TMethod extends keyof TDelegate,
> = TDelegate[TMethod] extends (args: infer A) => unknown ? A : never;

type DelegateReturn<
  TDelegate,
  TMethod extends keyof TDelegate,
> = TDelegate[TMethod] extends (...args: never[]) => infer R
  ? Awaited<R>
  : never;

/**
 * Abstract base repository providing generic, type-safe CRUD operations for
 * any Prisma model delegate.
 *
 * Subclasses select the delegate in the constructor:
 *   class UserRepository extends BaseRepository<PrismaClient["user"]> {
 *     constructor() { super(prisma.user); }
 *   }
 *
 * Each method is a thin wrapper around the Prisma delegate. Business logic
 * (authorization, transformations, cross-entity operations) belongs in the
 * service layer, not here.
 *
 * Note on type-safety: the PUBLIC surface is fully typed — every method's
 * arguments and return type are derived from the concrete delegate via
 * `DelegateArg`/`DelegateReturn`, so SUBCLASSES and callers need no manual
 * assertions. The internal `as unknown as { … }` casts below are a deliberate,
 * localized implementation detail: TypeScript can't structurally call a method
 * across the generic `TDelegate` union, so we erase-then-restore the type at
 * the call boundary only. The casts never leak past this base class.
 */
export abstract class BaseRepository<
  TDelegate extends {
    findUnique: (args: never) => unknown;
    findMany: (args?: never) => unknown;
    findFirst: (args?: never) => unknown;
    create: (args: never) => unknown;
    update: (args: never) => unknown;
    delete: (args: never) => unknown;
    count: (args?: never) => unknown;
    upsert: (args: never) => unknown;
  },
> {
  protected readonly prisma: PrismaClient;

  constructor(protected readonly delegate: TDelegate) {
    this.prisma = prisma;
  }

  async findUnique(
    args: DelegateArg<TDelegate, "findUnique">,
  ): Promise<DelegateReturn<TDelegate, "findUnique">> {
    return (
      this.delegate as unknown as {
        findUnique: (a: unknown) => Promise<unknown>;
      }
    ).findUnique(args) as Promise<DelegateReturn<TDelegate, "findUnique">>;
  }

  async findMany(
    args?: DelegateArg<TDelegate, "findMany">,
  ): Promise<DelegateReturn<TDelegate, "findMany">> {
    return (
      this.delegate as unknown as {
        findMany: (a?: unknown) => Promise<unknown>;
      }
    ).findMany(args) as Promise<DelegateReturn<TDelegate, "findMany">>;
  }

  async findFirst(
    args?: DelegateArg<TDelegate, "findFirst">,
  ): Promise<DelegateReturn<TDelegate, "findFirst">> {
    return (
      this.delegate as unknown as {
        findFirst: (a?: unknown) => Promise<unknown>;
      }
    ).findFirst(args) as Promise<DelegateReturn<TDelegate, "findFirst">>;
  }

  async count(
    args?: DelegateArg<TDelegate, "count">,
  ): Promise<number> {
    return (
      this.delegate as unknown as {
        count: (a?: unknown) => Promise<number>;
      }
    ).count(args);
  }

  async create(
    args: DelegateArg<TDelegate, "create">,
  ): Promise<DelegateReturn<TDelegate, "create">> {
    return (
      this.delegate as unknown as {
        create: (a: unknown) => Promise<unknown>;
      }
    ).create(args) as Promise<DelegateReturn<TDelegate, "create">>;
  }

  async update(
    args: DelegateArg<TDelegate, "update">,
  ): Promise<DelegateReturn<TDelegate, "update">> {
    return (
      this.delegate as unknown as {
        update: (a: unknown) => Promise<unknown>;
      }
    ).update(args) as Promise<DelegateReturn<TDelegate, "update">>;
  }

  async delete(
    args: DelegateArg<TDelegate, "delete">,
  ): Promise<DelegateReturn<TDelegate, "delete">> {
    return (
      this.delegate as unknown as {
        delete: (a: unknown) => Promise<unknown>;
      }
    ).delete(args) as Promise<DelegateReturn<TDelegate, "delete">>;
  }

  async upsert(
    args: DelegateArg<TDelegate, "upsert">,
  ): Promise<DelegateReturn<TDelegate, "upsert">> {
    return (
      this.delegate as unknown as {
        upsert: (a: unknown) => Promise<unknown>;
      }
    ).upsert(args) as Promise<DelegateReturn<TDelegate, "upsert">>;
  }

  transaction<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return prisma.$transaction(callback);
  }

  /**
   * Paginated list helper — returns items with pagination metadata.
   * Meant to be used with PaginationQuery from src/shared/schemas/pagination.schema.ts
   *
   * Note: subclasses may want to override this to add model-specific default
   * ordering or default `include` relations.
   */
  async findPaginated(args: {
    page: number;
    limit: number;
    where?: DelegateArg<TDelegate, "findMany"> extends {
      where?: infer W;
    }
      ? W
      : never;
    include?: DelegateArg<TDelegate, "findMany"> extends {
      include?: infer I;
    }
      ? I
      : never;
    orderBy?: DelegateArg<TDelegate, "findMany"> extends {
      orderBy?: infer O;
    }
      ? O
      : never;
  }): Promise<{
    data: DelegateReturn<TDelegate, "findMany">;
    meta: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const { page, limit, where, include, orderBy } = args;
    const skip = (page - 1) * limit;

    const delegate = this.delegate as unknown as {
      findMany: (a: unknown) => Promise<unknown>;
      count: (a: unknown) => Promise<number>;
    };

    const [data, total] = await Promise.all([
      delegate.findMany({ where, include, orderBy, skip, take: limit }),
      delegate.count({ where }),
    ]);

    return {
      data: data as DelegateReturn<TDelegate, "findMany">,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
