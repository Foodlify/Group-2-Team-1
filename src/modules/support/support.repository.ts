import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";
import type { TicketCategoryValue, TicketStatusValue } from "./support.model";

export class SupportTicketRepository extends BaseRepository<
  PrismaClient["supportTicket"]
> {
  constructor() {
    super(prisma.supportTicket);
  }

  async findByRequestId(requestId: string) {
    return this.findUnique({ where: { requestId } });
  }

  async findByCustomerId(customerId: string) {
    return this.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Admin: paginated list across all customers, optional status filter. */
  async findPaginatedAll(options: {
    page: number;
    limit: number;
    status?: TicketStatusValue;
  }) {
    const where: Prisma.SupportTicketWhereInput = options.status
      ? { status: options.status }
      : {};
    const skip = (options.page - 1) * options.limit;
    const [data, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: options.limit,
      }),
      prisma.supportTicket.count({ where }),
    ]);
    return {
      data,
      meta: {
        page: options.page,
        limit: options.limit,
        total,
        totalPages: Math.ceil(total / options.limit),
      },
    };
  }

  /**
   * Creates the ticket and assigns it to the least-loaded agent of the
   * matching section. The counter increment happens in the SAME transaction —
   * G1T1's version ran this query but never incremented the counter, so every
   * ticket in a category landed on the same agent.
   */
  async createWithAssignment(data: {
    requestId: string;
    customerId: string;
    orderId: string | null;
    category: TicketCategoryValue;
    subject: string;
    description: string;
  }) {
    return this.transaction(async (tx) => {
      const agent = await tx.customerServiceEmployee.findFirst({
        where: { section: data.category },
        orderBy: { assignedTickets: "asc" },
        select: { id: true },
      });
      const ticket = await tx.supportTicket.create({
        data: { ...data, assignedAgentId: agent?.id ?? null },
      });
      if (agent) {
        await tx.customerServiceEmployee.update({
          where: { id: agent.id },
          data: { assignedTickets: { increment: 1 } },
        });
      }
      return ticket;
    });
  }

  async updateStatus(id: string, status: TicketStatusValue) {
    return this.update({ where: { id }, data: { status } });
  }

  /** Resolve the ticket and free the assigned agent's slot in one transaction. */
  async resolve(
    id: string,
    resolution: string,
    assignedAgentId: string | null,
  ) {
    return this.transaction(async (tx) => {
      const ticket = await tx.supportTicket.update({
        where: { id },
        data: { status: "RESOLVED", resolution, resolvedAt: new Date() },
      });
      if (assignedAgentId) {
        await tx.customerServiceEmployee.updateMany({
          where: { id: assignedAgentId, assignedTickets: { gt: 0 } },
          data: { assignedTickets: { decrement: 1 } },
        });
      }
      return ticket;
    });
  }
}

export const supportTicketRepository = new SupportTicketRepository();
