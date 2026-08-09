import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { asyncHandler } from "../../utils/asyncHandler";
import logger from "../../config/logger";
import { paymentWebhookService } from "./payment.webhook.service";

/**
 * Stripe's webhook endpoint.
 *
 * Deliberately not wrapped in `sendSuccess`: Stripe does not read our response
 * envelope, it reads the status code. Anything outside 2xx is a retry signal.
 */
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
        error,
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
