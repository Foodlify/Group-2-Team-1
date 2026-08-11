import { z } from "zod";
import { schemaRegistry } from "../../openapi/registry";
import {
  PaginationMetaSchema,
  PaginationQuerySchema,
} from "../../shared/schemas/pagination.schema";
import { AUDIT_ACTIONS, AUDITED_ENTITIES } from "./auditing.model";

export const AuditListQuerySchema = PaginationQuerySchema.extend({
  entity: z.enum(AUDITED_ENTITIES).optional().meta({
    description: "Which kind of row the entries describe",
    example: "Transaction",
  }),
  entityId: z.cuid2().optional().meta({
    description:
      "Everything that happened to one row — the trail for a single transaction",
  }),
  action: z.enum(AUDIT_ACTIONS).optional().meta({
    description: "Only creates, only status changes, ...",
    example: "STATUS_CHANGED",
  }),

  actorId: z.string().min(1).optional().meta({
    description: "Everything one account did",
  }),
}).meta({
  id: "AuditListQuery",
  description: "Filters for the audit trail",
});

export const AuditEventResponseSchema = z
  .object({
    id: z.cuid2(),
    entity: z.string().meta({ example: "Transaction" }),
    entityId: z.string().meta({
      description:
        "Id of the audited row. Not a foreign key — the entry outlives the row it describes.",
    }),
    action: z.enum(AUDIT_ACTIONS),
    changes: z.unknown().meta({
      description:
        "What changed. `{ field: { from, to } }` for updates, the row's meaningful fields for a create. Money is a string so JSON cannot round it.",
      example: { status: { from: "PENDING", to: "SUCCESS" } },
    }),
    actorId: z.string().nullable().meta({
      description:
        "Who. Null when nothing human was behind it — a gateway webhook, a scheduled sweep.",
    }),
    actorRole: z.string().nullable(),
    ip: z.string().nullable(),
    route: z.string().nullable().meta({ example: "POST /api/v1/orders" }),
    createdAt: z.iso.datetime(),
  })
  .meta({
    id: "AuditEvent",
    description: "One append-only entry in the audit trail",
  });

export const AuditListSuccessResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.array(AuditEventResponseSchema),
    meta: PaginationMetaSchema,
  })
  .meta({ id: "AuditListSuccessResponse" });

schemaRegistry.register("AuditListQuery", AuditListQuerySchema);
schemaRegistry.register("AuditEvent", AuditEventResponseSchema);
schemaRegistry.register(
  "AuditListSuccessResponse",
  AuditListSuccessResponseSchema,
);

export type AuditListQueryInput = z.infer<typeof AuditListQuerySchema>;
export type AuditEventResponse = z.infer<typeof AuditEventResponseSchema>;
