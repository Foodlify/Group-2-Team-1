import type { Prisma } from "../../generated/prisma/client";
import prisma from "../../config/prisma";
import { currentContext } from "../../shared/context/request.context";
import type { AuditAction, AuditedEntity } from "./auditing.model";

/** What a caller has to state; the actor and request details come from context. */
export interface AuditableEvent {
  entity: AuditedEntity;
  entityId: string;
  action: AuditAction;
  changes?: Prisma.InputJsonValue;
}

/**
 * Writes to the audit trail, and reads it back.
 *
 * There is no `update` and no `delete` here, and there will not be one. The
 * table is append-only, and the cheapest way to guarantee that is to give the
 * rest of the codebase no method that could do otherwise.
 */
export class AuditingRepository {
  /**
   * Appends one entry, using the caller's database transaction.
   *
   * `client` is required rather than optional — the entry must land in the same
   * transaction as the change it describes, and an optional parameter is one
   * somebody eventually leaves off. The type is `Prisma.TransactionClient`,
   * which the top-level `prisma` client also satisfies, so a caller that
   * genuinely has no transaction still has to say so out loud.
   */
  async record(
    event: AuditableEvent,
    client: Prisma.TransactionClient,
  ): Promise<void> {
    const context = currentContext();
    await client.auditingEvent.create({
      data: {
        entity: event.entity,
        entityId: event.entityId,
        action: event.action,
        ...(event.changes !== undefined ? { changes: event.changes } : {}),
        actorId: context?.actorId ?? null,
        actorRole: context?.actorRole ?? null,
        ip: context?.ip ?? null,
        route: context?.route ?? null,
      },
    });
  }

  /**
   * One page of the trail, newest first, plus the total.
   *
   * Both in a single `$transaction` for the same reason as the transaction
   * listing: an entry landing between the two queries would give a total that
   * describes a different set than the rows returned.
   */
  async findPage(
    where: Prisma.AuditingEventWhereInput,
    skip: number,
    take: number,
  ) {
    const [rows, total] = await prisma.$transaction([
      prisma.auditingEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.auditingEvent.count({ where }),
    ]);
    return { rows, total };
  }
}

export const auditingRepository = new AuditingRepository();
