import { z } from "zod";
import { schemaRegistry } from "../../openapi/registry";
import {
  PaginationMetaSchema,
  PaginationQuerySchema,
} from "../../shared/schemas/pagination.schema";
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
} from "./support.model";

export const CreateTicketRequestSchema = z
  .object({
    orderId: z.cuid2().optional().meta({
      description: "Order the complaint is about (must be one of my orders)",
      example: "clxyz...",
    }),
    category: z.enum(TICKET_CATEGORIES).meta({ example: "ORDER_ISSUE" }),
    subject: z.string().min(1).max(50).meta({ example: "Order arrived cold" }),
    description: z.string().min(1).max(250).meta({
      example: "The food was cold when it arrived, 40 minutes late.",
    }),
  })
  .meta({
    id: "CreateTicketRequest",
    description: "Raise a complaint / ask for help",
  });

export const TicketRequestIdParamsSchema = z
  .object({
    requestId: z
      .string()
      .regex(/^TCK-[A-Z0-9]{10}$/)
      .meta({
        description: "Opaque public ticket reference",
        example: "TCK-8F3KZQW1P2",
      }),
  })
  .meta({ id: "TicketRequestIdParams" });

export const AdminTicketQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(TICKET_STATUSES).optional().meta({
    description: "Filter by ticket status",
    example: "OPEN",
  }),
}).meta({
  id: "AdminTicketQuery",
  description: "Pagination + optional status filter",
});

export const UpdateTicketStatusRequestSchema = z
  .object({
    status: z.enum(TICKET_STATUSES).meta({ example: "IN_PROGRESS" }),
  })
  .meta({ id: "UpdateTicketStatusRequest" });

export const ResolveTicketRequestSchema = z
  .object({
    resolution: z.string().min(1).max(500).meta({
      example: "Refunded the delivery fee and apologized to the customer.",
    }),
  })
  .meta({ id: "ResolveTicketRequest" });

export const TicketResponseSchema = z
  .object({
    id: z.cuid2(),
    requestId: z.string(),
    customerId: z.cuid2(),
    orderId: z.cuid2().nullable(),
    category: z.enum(TICKET_CATEGORIES),
    priority: z.enum(TICKET_PRIORITIES),
    status: z.enum(TICKET_STATUSES),
    subject: z.string(),
    description: z.string(),
    assignedAgentId: z.cuid2().nullable(),
    resolution: z.string().nullable(),
    resolvedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "TicketResponse" });

export const TicketSuccessResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: TicketResponseSchema,
  })
  .meta({ id: "TicketSuccessResponse" });

export const TicketListSuccessResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.array(TicketResponseSchema),
  })
  .meta({ id: "TicketListSuccessResponse" });

export const TicketPaginatedSuccessResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.array(TicketResponseSchema),
    meta: PaginationMetaSchema,
  })
  .meta({ id: "TicketPaginatedSuccessResponse" });

schemaRegistry.register("CreateTicketRequest", CreateTicketRequestSchema);
schemaRegistry.register("TicketRequestIdParams", TicketRequestIdParamsSchema);
schemaRegistry.register("AdminTicketQuery", AdminTicketQuerySchema);
schemaRegistry.register(
  "UpdateTicketStatusRequest",
  UpdateTicketStatusRequestSchema,
);
schemaRegistry.register("ResolveTicketRequest", ResolveTicketRequestSchema);
schemaRegistry.register("TicketResponse", TicketResponseSchema);
schemaRegistry.register("TicketSuccessResponse", TicketSuccessResponseSchema);
schemaRegistry.register(
  "TicketListSuccessResponse",
  TicketListSuccessResponseSchema,
);
schemaRegistry.register(
  "TicketPaginatedSuccessResponse",
  TicketPaginatedSuccessResponseSchema,
);

export type CreateTicketInput = z.infer<typeof CreateTicketRequestSchema>;
export type TicketRequestIdParams = z.infer<typeof TicketRequestIdParamsSchema>;
export type AdminTicketQuery = z.infer<typeof AdminTicketQuerySchema>;
export type UpdateTicketStatusInput = z.infer<
  typeof UpdateTicketStatusRequestSchema
>;
export type ResolveTicketInput = z.infer<typeof ResolveTicketRequestSchema>;
export type TicketResponse = z.infer<typeof TicketResponseSchema>;
