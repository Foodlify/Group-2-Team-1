import prisma from "../../config/prisma";
import logger from "../../config/logger";
import { AppError } from "../../middlewares/error.middleware";
import { paymentErrors } from "../../shared/exceptions/payment.errors";
import type { PaymentMethod } from "../transaction/transaction.model";
import type { UpdateIntegrationInput } from "./integration.validation";

class PaymentIntegrationService {
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

  async isMethodEnabled(method: PaymentMethod): Promise<boolean> {
    const type = await prisma.paymentIntegrationType.findFirst({
      where: { paymentMethod: method },
      select: { isEnabled: true },
    });
    return type?.isEnabled ?? true;
  }

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
