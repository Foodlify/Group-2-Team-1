export const supportErrors = {
  TICKET_NOT_FOUND: {
    message: "Support ticket not found",
    statusCode: 404,
  },
  TICKET_ALREADY_RESOLVED: {
    message: "This ticket is already resolved or closed",
    statusCode: 409,
  },
} as const;
