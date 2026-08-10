export {
  TicketStatus,
  TicketPriority,
  TicketCategory,
} from "../../generated/prisma/enums";

export const TICKET_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING_CUSTOMER",
  "RESOLVED",
  "CLOSED",
  "ESCALATED",
] as const;

export const TICKET_CATEGORIES = [
  "ORDER_ISSUE",
  "PAYMENT",
  "DELIVERY_DELAY",
  "REFUND",
  "ACCOUNT",
  "OTHERS",
] as const;

export const TICKET_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

export type TicketStatusValue = (typeof TICKET_STATUSES)[number];
export type TicketCategoryValue = (typeof TICKET_CATEGORIES)[number];
