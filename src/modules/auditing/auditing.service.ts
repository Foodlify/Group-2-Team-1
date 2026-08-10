import type { Prisma } from "../../generated/prisma/client";
import { auditingRepository } from "./auditing.repository";
import type { AuditAction, AuditedEntity } from "./auditing.model";

export interface AuditListQuery {
  page: number;
  limit: number;
  entity?: AuditedEntity;
  entityId?: string;
  action?: AuditAction;
  actorId?: string;
}

class AuditingService {
  async list(query: AuditListQuery) {
    const where: Prisma.AuditingEventWhereInput = {
      ...(query.entity ? { entity: query.entity } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
    };
    return auditingRepository.findPage(
      where,
      (query.page - 1) * query.limit,
      query.limit,
    );
  }
}

export const auditingService = new AuditingService();
