export { AuditAction } from "../../generated/prisma/enums";

export const AUDIT_ACTIONS = ["CREATED", "UPDATED", "STATUS_CHANGED"] as const;

export const AUDITED_ENTITIES = ["Transaction"] as const;

export type AuditedEntity = (typeof AUDITED_ENTITIES)[number];
