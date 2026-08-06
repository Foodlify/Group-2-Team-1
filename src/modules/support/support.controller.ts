import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendSuccess } from "../../utils/response";
import { customerService } from "../customer/customer.service";
import { supportService } from "./support.service";
import type {
  AdminTicketQuery,
  TicketRequestIdParams,
} from "./support.validation";

// ─── Customer ─────────────────────────────────────────────

export const createTicket = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const customerId = await customerService.requireCustomerIdByUserId(
      req.user!.id,
    );
    const ticket = await supportService.create(customerId, req.body);
    sendSuccess(res, ticket, "Support ticket created", StatusCodes.CREATED);
  },
);

export const listMyTickets = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const customerId = await customerService.requireCustomerIdByUserId(
      req.user!.id,
    );
    const tickets = await supportService.listMine(customerId);
    sendSuccess(res, tickets, "Support tickets retrieved");
  },
);

export const getMyTicket = asyncHandler(
  async (req: Request<TicketRequestIdParams>, res: Response): Promise<void> => {
    const customerId = await customerService.requireCustomerIdByUserId(
      req.user!.id,
    );
    const ticket = await supportService.getMineByRequestId(
      customerId,
      req.params.requestId,
    );
    sendSuccess(res, ticket, "Support ticket retrieved");
  },
);

// ─── Admin ────────────────────────────────────────────────

export const adminListTickets = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { tickets, meta } = await supportService.adminList(
      req.query as unknown as AdminTicketQuery,
    );
    sendSuccess(
      res,
      tickets,
      "Support tickets retrieved",
      StatusCodes.OK,
      meta,
    );
  },
);

export const updateTicketStatus = asyncHandler(
  async (req: Request<TicketRequestIdParams>, res: Response): Promise<void> => {
    const ticket = await supportService.adminUpdateStatus(
      req.params.requestId,
      req.body,
    );
    sendSuccess(res, ticket, "Ticket status updated");
  },
);

export const resolveTicket = asyncHandler(
  async (req: Request<TicketRequestIdParams>, res: Response): Promise<void> => {
    const ticket = await supportService.adminResolve(
      req.params.requestId,
      req.body.resolution,
    );
    sendSuccess(res, ticket, "Ticket resolved");
  },
);
