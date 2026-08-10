export { AuditAction } from "../../generated/prisma/enums";

// Kept for Zod schema definitions, mirroring the other modules.
export const AUDIT_ACTIONS = ["CREATED", "UPDATED", "STATUS_CHANGED"] as const;

/**
 * Entities that currently write audit entries.
 *
 * A string column in the database — the table is generic and a new audited
 * entity should not need a migration — but a closed list here, so the API can
 * reject `?entity=Trasnaction` instead of quietly returning an empty page and
 * letting the caller conclude nothing ever happened.
 */
export const AUDITED_ENTITIES = ["Transaction"] as const;

export type AuditedEntity = (typeof AUDITED_ENTITIES)[number];
