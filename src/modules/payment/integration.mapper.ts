import type {
  PaymentIntegrationTypeModel,
  PaymentIntegrationConfigurationModel,
} from "../../generated/prisma/models";
import type { IntegrationResponse } from "./integration.validation";

type WithConfiguration = PaymentIntegrationTypeModel & {
  configuration: PaymentIntegrationConfigurationModel | null;
};

/**
 * Integration row → API shape.
 *
 * `secretConfigured` is computed here from `process.env` and is the only thing
 * this endpoint ever says about a secret: whether the named variable has a
 * value on this deployment. That answers the question an admin actually has —
 * "is this integration wired up?" — without the response, the logs it may end
 * up in, or the browser tab it is read in ever holding the key itself.
 */
export const toIntegrationResponse = (
  type: WithConfiguration,
): IntegrationResponse => ({
  code: type.code,
  displayName: type.displayName,
  paymentMethod: type.paymentMethod,
  isEnabled: type.isEnabled,
  configuration: type.configuration
    ? {
        currency: type.configuration.currency,
        successUrl: type.configuration.successUrl,
        cancelUrl: type.configuration.cancelUrl,
        isTestMode: type.configuration.isTestMode,
        secretKeyEnvVar: type.configuration.secretKeyEnvVar,
        webhookSecretEnvVar: type.configuration.webhookSecretEnvVar,
        secretConfigured: hasEnvValue(type.configuration.secretKeyEnvVar),
      }
    : null,
  createdAt: type.createdAt.toISOString(),
  updatedAt: type.updatedAt.toISOString(),
});

/** True when the named variable exists and is not blank. Never its value. */
const hasEnvValue = (name: string | null): boolean => {
  if (!name) return false;
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
};
