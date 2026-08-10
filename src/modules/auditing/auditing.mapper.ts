import type { AuditingEventModel } from "../../generated/prisma/models";
import type { AuditEventResponse } from "./auditing.validation";

/**
 * Audit row → API shape.
 *
 * `changes` is passed through as it was stored. It is the one field whose shape
 * varies by action, and normalising it here would mean deciding, at read time,
 * what a past write meant — exactly the retroactive interpretation an audit
 * trail is supposed to make unnecessary.
 */
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
