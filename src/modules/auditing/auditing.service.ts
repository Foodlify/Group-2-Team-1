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

/**
 * Reading the audit trail.
 *
 * Read-only by design. Recording happens at the repository layer, inside the
 * transaction that makes the change — routing it through here would mean the
 * service could be called on its own, and an audit entry written independently
 * of the change it describes is a claim, not a record.
 */
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
