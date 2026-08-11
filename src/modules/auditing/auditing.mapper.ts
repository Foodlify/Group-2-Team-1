import type { AuditingEventModel } from "../../generated/prisma/models";
import type { AuditEventResponse } from "./auditing.validation";

export const toAuditEventResponse = (
  event: AuditingEventModel,
): AuditEventResponse => ({
  id: event.id,
  entity: event.entity,
  entityId: event.entityId,
  action: event.action,
  changes: event.changes ?? null,
  actorId: event.actorId,
  actorRole: event.actorRole,
  ip: event.ip,
  route: event.route,
  createdAt: event.createdAt.toISOString(),
});
