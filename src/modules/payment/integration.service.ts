import prisma from "../../config/prisma";
import logger from "../../config/logger";
import { AppError } from "../../middlewares/error.middleware";
import { paymentErrors } from "../../shared/exceptions/payment.errors";
import type { PaymentMethod } from "../transaction/transaction.model";
import type { UpdateIntegrationInput } from "./integration.validation";

/**
 * The official `Payment Integration Type` and `Payment Integration
 * Configuration` tables.
 *
 * What they are FOR, given the gateway is already configured by environment
 * variables: turning an integration off without a redeploy. Today, stopping
 * card payments means removing `STRIPE_SECRET_KEY` and restarting — which is
 * not what anyone wants to be doing at the moment a gateway starts
 * misbehaving. `isEnabled` is read when a payment is taken, so flipping it
 * takes effect on the next request.
 *
 * What they are NOT for: secrets. The configuration records the NAME of the
 * environment variable holding each key and never the key, because a database
 * is dumped, backed up and replicated, and a key in a table is a key in all of
 * those places.
 */
class PaymentIntegrationService {
  /** Everything an admin needs to see how payments are wired up. */
  async list() {
    return prisma.paymentIntegrationType.findMany({
      orderBy: { code: "asc" },
      include: { configuration: true },
    });
  }

  async findByCode(code: string) {
    return prisma.paymentIntegrationType.findUnique({
      where: { code },
      include: { configuration: true },
    });
  }

  /**
   * Whether a method may be used right now.
   *
   * Returns true when no integration row describes the method at all. That is
   * deliberate: this table arrived after the payment methods did, and a
   * deployment whose seed has not run must keep taking payments rather than
   * silently refuse every one of them. Absence of a rule is not a rule.
   */
  async isMethodEnabled(method: PaymentMethod): Promise<boolean> {
    const type = await prisma.paymentIntegrationType.findFirst({
      where: { paymentMethod: method },
      select: { isEnabled: true },
    });
    return type?.isEnabled ?? true;
  }

  /** Throws the same 400 an unregistered method gets, for the same reason. */
  async assertMethodEnabled(method: PaymentMethod): Promise<void> {
    if (await this.isMethodEnabled(method)) return;
    logger.warn("Rejected a payment through a disabled integration", {
      method,
    });
    throw new AppError(
      paymentErrors.INTEGRATION_DISABLED.message,
      paymentErrors.INTEGRATION_DISABLED.statusCode,
    );
  }

  /**
   * Updates one integration and its configuration together.
   *
   * The configuration row is upserted rather than required to exist, so an
   * integration seeded without one can still be configured — and two concurrent
   * admins cannot both insert.
   */
  async update(code: string, input: UpdateIntegrationInput) {
    const existing = await this.findByCode(code);
    if (!existing) {
      throw new AppError(
        paymentErrors.INTEGRATION_NOT_FOUND.message,
        paymentErrors.INTEGRATION_NOT_FOUND.statusCode,
      );
    }

    const { isEnabled, displayName, ...configuration } = input;

    return prisma.$transaction(async (tx) => {
      await tx.paymentIntegrationType.update({
        where: { code },
        data: {
          ...(isEnabled !== undefined ? { isEnabled } : {}),
          ...(displayName !== undefined ? { displayName } : {}),
        },
      });
      if (Object.keys(configuration).length > 0) {
        await tx.paymentIntegrationConfiguration.upsert({
          where: { typeId: existing.id },
          create: { ...configuration, typeId: existing.id },
          // Only the keys this request carried. An admin flipping `isTestMode`
          // has said nothing about the currency.
          update: configuration,
        });
      }
      return tx.paymentIntegrationType.findUniqueOrThrow({
        where: { code },
        include: { configuration: true },
      });
    });
  }
}

export const paymentIntegrationService = new PaymentIntegrationService();
