import { Router } from "express";
import { validate } from "../../middlewares/validate.middleware";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { routeRegistry } from "../../openapi/registry";
import * as controller from "./support.controller";
import {
  AdminTicketQuerySchema,
  CreateTicketRequestSchema,
  ResolveTicketRequestSchema,
  TicketRequestIdParamsSchema,
  UpdateTicketStatusRequestSchema,
} from "./support.validation";

// ─── My tickets (mounted at /customers/me/support-tickets) ───
export const mySupportRouter: Router = Router();
mySupportRouter.use(authenticate);
mySupportRouter.post(
  "/",
  validate({ body: CreateTicketRequestSchema }),
  controller.createTicket,
);
mySupportRouter.get("/", controller.listMyTickets);
mySupportRouter.get(
  "/:requestId",
  validate({ params: TicketRequestIdParamsSchema }),
  controller.getMyTicket,
);

// ─── Admin ticket management (mounted at /support-tickets) ───
// Status changes and resolution are agent actions — ADMIN only (G1T1 gated
// these behind customer auth by mistake).
export const adminSupportRouter: Router = Router();
adminSupportRouter.use(authenticate, authorize("ADMIN"));
adminSupportRouter.get(
  "/",
  validate({ query: AdminTicketQuerySchema }),
  controller.adminListTickets,
);
adminSupportRouter.patch(
  "/:requestId/status",
  validate({
    params: TicketRequestIdParamsSchema,
    body: UpdateTicketStatusRequestSchema,
  }),
  controller.updateTicketStatus,
);
adminSupportRouter.patch(
  "/:requestId/resolve",
  validate({
    params: TicketRequestIdParamsSchema,
    body: ResolveTicketRequestSchema,
  }),
  controller.resolveTicket,
);

// ─── OpenAPI Documentation ───────────────────────────────
const tag = "Support";
const errorRef = { $ref: "#/components/schemas/ErrorResponse" };
const validationErrorRef = {
  $ref: "#/components/schemas/ValidationErrorResponse",
};
const security: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { BearerAuth: [] },
];
const requestIdParam = {
  name: "requestId",
  in: "path",
  required: true,
  schema: { type: "string" as const },
} as const;
const jsonRef = (ref: string) => ({
  "application/json": { schema: { $ref: `#/components/schemas/${ref}` } },
});

routeRegistry.push({
  path: "/api/v1/customers/me/support-tickets",
  pathItem: {
    post: {
      tags: [tag],
      summary: "Raise a complaint / ask for help",
      description:
        "Creates a support ticket, optionally linked to one of my orders. The ticket is auto-assigned to the least-loaded agent of the matching section and gets an opaque quotable reference (requestId).",
      security,
      requestBody: { required: true, content: jsonRef("CreateTicketRequest") },
      responses: {
        "201": {
          description: "Created",
          content: jsonRef("TicketSuccessResponse"),
        },
        "400": {
          description: "Validation failed",
          content: { "application/json": { schema: validationErrorRef } },
        },
        "404": {
          description: "Linked order not found (or not yours)",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
    get: {
      tags: [tag],
      summary: "List my support tickets",
      security,
      responses: {
        "200": {
          description: "My tickets, newest first",
          content: jsonRef("TicketListSuccessResponse"),
        },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/customers/me/support-tickets/{requestId}",
  pathItem: {
    get: {
      tags: [tag],
      summary: "Get one of my support tickets by its reference",
      security,
      parameters: [requestIdParam],
      responses: {
        "200": {
          description: "Ticket",
          content: jsonRef("TicketSuccessResponse"),
        },
        "404": {
          description: "Ticket not found (or not yours)",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/support-tickets",
  pathItem: {
    get: {
      tags: [tag],
      summary: "List all support tickets (ADMIN)",
      security,
      parameters: [
        { name: "page", in: "query", schema: { type: "integer", default: 1 } },
        {
          name: "limit",
          in: "query",
          schema: { type: "integer", default: 20 },
        },
        {
          name: "status",
          in: "query",
          schema: { type: "string" },
          description: "Filter by ticket status",
        },
      ],
      responses: {
        "200": {
          description: "Tickets, newest first",
          content: jsonRef("TicketPaginatedSuccessResponse"),
        },
        "403": {
          description: "Forbidden",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/support-tickets/{requestId}/status",
  pathItem: {
    patch: {
      tags: [tag],
      summary: "Update a ticket's status (ADMIN)",
      security,
      parameters: [requestIdParam],
      requestBody: {
        required: true,
        content: jsonRef("UpdateTicketStatusRequest"),
      },
      responses: {
        "200": {
          description: "Updated",
          content: jsonRef("TicketSuccessResponse"),
        },
        "403": {
          description: "Forbidden",
          content: { "application/json": { schema: errorRef } },
        },
        "404": {
          description: "Ticket not found",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/support-tickets/{requestId}/resolve",
  pathItem: {
    patch: {
      tags: [tag],
      summary: "Resolve a ticket (ADMIN)",
      description:
        "Stamps the resolution + resolvedAt, sets status to RESOLVED, and frees the assigned agent's slot in the same transaction.",
      security,
      parameters: [requestIdParam],
      requestBody: { required: true, content: jsonRef("ResolveTicketRequest") },
      responses: {
        "200": {
          description: "Resolved",
          content: jsonRef("TicketSuccessResponse"),
        },
        "403": {
          description: "Forbidden",
          content: { "application/json": { schema: errorRef } },
        },
        "404": {
          description: "Ticket not found",
          content: { "application/json": { schema: errorRef } },
        },
        "409": {
          description: "Already resolved or closed",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});
