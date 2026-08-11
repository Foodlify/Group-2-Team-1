import type { Prisma } from "../../generated/prisma/client";
import prisma from "../../config/prisma";
import { currentContext } from "../../shared/context/request.context";
import type { AuditAction, AuditedEntity } from "./auditing.model";

export interface AuditableEvent {
  entity: AuditedEntity;
  entityId: string;
  action: AuditAction;
  changes?: Prisma.InputJsonValue;
}

export class AuditingRepository {
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
