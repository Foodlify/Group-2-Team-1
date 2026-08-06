import crypto from "crypto";
import { appError } from "../../middlewares/error.middleware";
import { isUniqueViolation } from "../../shared/exceptions/prisma.errors";
import { orderErrors } from "../../shared/exceptions/order.errors";
import { supportErrors } from "../../shared/exceptions/support.errors";
import { orderRepository } from "../order/order.repository";
import { supportTicketRepository } from "./support.repository";
import type { SupportTicketModel } from "../../generated/prisma/models";
import type {
  AdminTicketQuery,
  CreateTicketInput,
  TicketResponse,
  UpdateTicketStatusInput,
} from "./support.validation";

/** Unambiguous alphabet (no O/0/I/1/L confusion) for quotable references. */
const REQUEST_ID_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const REQUEST_ID_LENGTH = 10;

class SupportService {
  /**
   * Customer raises a complaint / asks for help. When the ticket references
   * an order, ownership is verified first (404 — never reveal foreign order
   * ids). Assignment goes to the least-loaded agent of the matching section.
   */
  async create(
    customerId: string,
    input: CreateTicketInput,
  ): Promise<TicketResponse> {
    if (input.orderId) {
      const order = await orderRepository.findById(input.orderId);
      if (!order || order.customerId !== customerId) {
        throw appError(orderErrors.ORDER_NOT_FOUND);
      }
    }

    // Retry on the (astronomically unlikely) requestId collision — the DB
    // unique constraint is the arbiter.
    for (let attempt = 1; ; attempt++) {
      try {
        const ticket = await supportTicketRepository.createWithAssignment({
          requestId: this.generateRequestId(),
          customerId,
          orderId: input.orderId ?? null,
          category: input.category,
          subject: input.subject,
          description: input.description,
        });
        return this.toTicketResponse(ticket);
      } catch (e) {
        if (isUniqueViolation(e) && attempt < 3) continue;
        throw e;
      }
    }
  }

  async listMine(customerId: string): Promise<TicketResponse[]> {
    const tickets = await supportTicketRepository.findByCustomerId(customerId);
    return tickets.map((t) => this.toTicketResponse(t));
  }

  /** Ownership-scoped read — a foreign requestId behaves exactly like a missing one. */
  async getMineByRequestId(
    customerId: string,
    requestId: string,
  ): Promise<TicketResponse> {
    const ticket = await supportTicketRepository.findByRequestId(requestId);
    if (!ticket || ticket.customerId !== customerId) {
      throw appError(supportErrors.TICKET_NOT_FOUND);
    }
    return this.toTicketResponse(ticket);
  }

  // ─── Admin ────────────────────────────────────────────
  async adminList(query: AdminTicketQuery): Promise<{
    tickets: TicketResponse[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = await supportTicketRepository.findPaginatedAll({
      page: query.page,
      limit: query.limit,
      ...(query.status ? { status: query.status } : {}),
    });
    return {
      tickets: page.data.map((t) => this.toTicketResponse(t)),
      meta: page.meta,
    };
  }

  async adminUpdateStatus(
    requestId: string,
    input: UpdateTicketStatusInput,
  ): Promise<TicketResponse> {
    const ticket = await this.getByRequestIdOrThrow(requestId);
    const updated = await supportTicketRepository.updateStatus(
      ticket.id,
      input.status,
    );
    return this.toTicketResponse(updated);
  }

  async adminResolve(
    requestId: string,
    resolution: string,
  ): Promise<TicketResponse> {
    const ticket = await this.getByRequestIdOrThrow(requestId);
    if (ticket.status === "RESOLVED" || ticket.status === "CLOSED") {
      throw appError(supportErrors.TICKET_ALREADY_RESOLVED);
    }
    const resolved = await supportTicketRepository.resolve(
      ticket.id,
      resolution,
      ticket.assignedAgentId,
    );
    return this.toTicketResponse(resolved);
  }

  // ─── Private helpers ──────────────────────────────────
  private async getByRequestIdOrThrow(requestId: string) {
    const ticket = await supportTicketRepository.findByRequestId(requestId);
    if (!ticket) throw appError(supportErrors.TICKET_NOT_FOUND);
    return ticket;
  }

  private generateRequestId(): string {
    let ref = "";
    for (let i = 0; i < REQUEST_ID_LENGTH; i++) {
      ref += REQUEST_ID_ALPHABET[crypto.randomInt(REQUEST_ID_ALPHABET.length)];
    }
    return `TCK-${ref}`;
  }

  private toTicketResponse(t: SupportTicketModel): TicketResponse {
    return {
      id: t.id,
      requestId: t.requestId,
      customerId: t.customerId,
      orderId: t.orderId,
      category: t.category,
      priority: t.priority,
      status: t.status,
      subject: t.subject,
      description: t.description,
      assignedAgentId: t.assignedAgentId,
      resolution: t.resolution,
      resolvedAt: t.resolvedAt ? t.resolvedAt.toISOString() : null,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  }
}

export const supportService = new SupportService();
