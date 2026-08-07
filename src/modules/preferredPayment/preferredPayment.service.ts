import { appError } from "../../middlewares/error.middleware";
import { isUniqueViolation } from "../../shared/exceptions/prisma.errors";
import { customerErrors } from "../../shared/exceptions/customer.errors";
import { preferredPaymentRepository } from "./preferredPayment.repository";
import type { PreferredPaymentSettingModel } from "../../generated/prisma/models";
import type {
  CreatePaymentSettingInput,
  PaymentSettingResponse,
} from "../customer/customer.validation";

class PreferredPaymentService {
  async listByCustomer(customerId: string): Promise<PaymentSettingResponse[]> {
    const settings =
      await preferredPaymentRepository.findByCustomerId(customerId);
    return settings.map((s) => this.toResponse(s));
  }

  async create(
    customerId: string,
    input: CreatePaymentSettingInput,
  ): Promise<PaymentSettingResponse> {
    // The customer's first saved method becomes the default automatically.
    const existing =
      await preferredPaymentRepository.countByCustomerId(customerId);
    try {
      const setting = await preferredPaymentRepository.create({
        data: { customerId, method: input.method, isDefault: existing === 0 },
      });
      return this.toResponse(setting);
    } catch (e) {
      // @@unique([customerId, method]) makes the DB the arbiter of duplicates.
      if (isUniqueViolation(e)) {
        throw appError(customerErrors.PAYMENT_METHOD_ALREADY_SAVED);
      }
      throw e;
    }
  }

  async setDefault(
    customerId: string,
    settingId: string,
  ): Promise<PaymentSettingResponse> {
    await this.assertOwned(settingId, customerId);
    const setting = await preferredPaymentRepository.setDefault(
      customerId,
      settingId,
    );
    return this.toResponse(setting);
  }

  async remove(customerId: string, settingId: string): Promise<void> {
    const setting = await this.assertOwned(settingId, customerId);
    await preferredPaymentRepository.deleteAndReassignDefault(
      customerId,
      settingId,
      setting.isDefault,
    );
  }

  // ─── Private helpers ──────────────────────────────────
  private async assertOwned(
    settingId: string,
    customerId: string,
  ): Promise<PreferredPaymentSettingModel> {
    const setting = await preferredPaymentRepository.findById(settingId);
    if (!setting) throw appError(customerErrors.PAYMENT_SETTING_NOT_FOUND);
    if (setting.customerId !== customerId) {
      throw appError(customerErrors.PAYMENT_SETTING_FORBIDDEN);
    }
    return setting;
  }

  private toResponse(s: PreferredPaymentSettingModel): PaymentSettingResponse {
    return {
      id: s.id,
      customerId: s.customerId,
      method: s.method,
      isDefault: s.isDefault,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    };
  }
}

export const preferredPaymentService = new PreferredPaymentService();
