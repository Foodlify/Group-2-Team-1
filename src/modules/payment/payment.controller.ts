import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { asyncHandler } from "../../utils/asyncHandler";
import { paymentIntegrationService } from "./integration.service";
import { toIntegrationResponse } from "./integration.mapper";
import type {
  IntegrationCodeParams,
  UpdateIntegrationInput,
} from "./integration.validation";
import logger from "../../config/logger";
import { describeError } from "../../shared/errors/describe";
import { sendSuccess } from "../../utils/response";
import { paymentService } from "./payment.service";
import { paymentWebhookService } from "./payment.webhook.service";
import type {
  OutstandingRefundsQuery,
  TransactionIdParams,
} from "./payment.validation";

/**
 * Stripe's webhook endpoint.
 *
 * Deliberately not wrapped in `sendSuccess`: Stripe does not read our response
 * envelope, it reads the status code. Anything outside 2xx is a retry signal.
 */
export const listOutstandingRefunds = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const query = req.query as unknown as OutstandingRefundsQuery;
    const refunds = await paymentService.outstandingRefunds(query.limit);
    sendSuccess(res, refunds, "Outstanding refunds retrieved");
  },
);

export const retryRefund = asyncHandler(
  async (req: Request<TransactionIdParams>, res: Response): Promise<void> => {
    const refund = await paymentService.retryRefund(req.params.transactionId);
    sendSuccess(res, refund, "Refund retried");
  },
);

export const stripeWebhook = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    // `express.raw` on this route leaves the body as a Buffer — the signature
    // is computed over exactly these bytes.
    const event = paymentWebhookService.constructEvent(
      req.body as Buffer,
      req.headers["stripe-signature"] as string | undefined,
    );

    try {
      await paymentWebhookService.handleEvent(event);
    } catch (error) {
      // Answer 500 so Stripe retries: a handler that failed halfway (a lost
      // database connection, say) means the event has NOT been applied, and
      // silently acknowledging it would strand a paid order as PENDING.
      logger.error("Stripe webhook handler failed", {
        eventId: event.id,
        type: event.type,
        ...describeError(error),
      });
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: "Webhook processing failed",
      });
      return;
    }

    res.status(StatusCodes.OK).json({ received: true });
  },
);

// ─── Payment integrations (ADMIN) ─────────────────────────

export const listIntegrations = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const types = await paymentIntegrationService.list();
    sendSuccess(
      res,
      types.map(toIntegrationResponse),
      "Payment integrations retrieved",
    );
  },
);

export const updateIntegration = asyncHandler(
  async (req: Request<IntegrationCodeParams>, res: Response): Promise<void> => {
    const updated = await paymentIntegrationService.update(
      req.params.code,
      req.body as UpdateIntegrationInput,
    );
    sendSuccess(
      res,
      toIntegrationResponse(updated),
      "Payment integration updated",
    );
  },
);
