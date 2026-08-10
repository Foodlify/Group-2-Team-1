import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendSuccess } from "../../utils/response";
import { auditingService } from "./auditing.service";
import { toAuditEventResponse } from "./auditing.mapper";
import type { AuditListQueryInput } from "./auditing.validation";

export const listAuditEvents = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    // `validate` has already parsed and coerced this; the cast is the same one
    // every other list controller in the project uses, because Express types
    // `req.query` as ParsedQs regardless of what middleware put there.
    const query = req.query as unknown as AuditListQueryInput;
    const { rows, total } = await auditingService.list(query);
    sendSuccess(
      res,
      rows.map(toAuditEventResponse),
      "Audit events retrieved",
      StatusCodes.OK,
      {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    );
  },
);
