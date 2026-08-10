import { Router } from "express";
import { validate } from "../../middlewares/validate.middleware";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { routeRegistry } from "../../openapi/registry";
import * as controller from "./auditing.controller";
import { AuditListQuerySchema } from "./auditing.validation";

const auditRouter: Router = Router();

auditRouter.use(authenticate, authorize("ADMIN"));

auditRouter.get(
  "/",
  validate({ query: AuditListQuerySchema }),
  controller.listAuditEvents,
);

export default auditRouter;

const tag = "Auditing";
const errorRef = { $ref: "#/components/schemas/ErrorResponse" };

routeRegistry.push({
  path: "/api/v1/audit-events",
  pathItem: {
    get: {
      tags: [tag],
      security: [{ cookieAuth: [] }, { BearerAuth: [] }],
      summary: "The audit trail (ADMIN)",
      description:
        "Append-only record of what happened to each transaction, who did it and from where, newest first. Filter by `entityId` for the trail of a single transaction. Entries are written inside the same database transaction as the change they describe, so a row here exists if and only if the change committed.",
      parameters: [
        {
          name: "page",
          in: "query" as const,
          schema: { type: "integer" as const, default: 1 },
        },
        {
          name: "limit",
          in: "query" as const,
          schema: { type: "integer" as const, default: 20, maximum: 100 },
        },
        {
          name: "entity",
          in: "query" as const,
          schema: { type: "string" as const, enum: ["Transaction"] },
        },
        {
          name: "entityId",
          in: "query" as const,
          description: "Everything that happened to one row",
          schema: { type: "string" as const },
        },
        {
          name: "action",
          in: "query" as const,
          schema: {
            type: "string" as const,
            enum: ["CREATED", "UPDATED", "STATUS_CHANGED"],
          },
        },
        {
          name: "actorId",
          in: "query" as const,
          description: "Everything one account did",
          schema: { type: "string" as const },
        },
      ],
      responses: {
        "200": {
          description: "A page of audit entries, newest first",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/AuditListSuccessResponse",
              },
            },
          },
        },
        "400": {
          description: "Invalid filter or pagination value",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ValidationErrorResponse",
              },
            },
          },
        },
        "401": {
          description: "Not signed in",
          content: { "application/json": { schema: errorRef } },
        },
        "403": {
          description: "Not an admin",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});
