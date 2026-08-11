import type {
  PaymentIntegrationTypeModel,
  PaymentIntegrationConfigurationModel,
} from "../../generated/prisma/models";
import type { IntegrationResponse } from "./integration.validation";

type WithConfiguration = PaymentIntegrationTypeModel & {
  configuration: PaymentIntegrationConfigurationModel | null;
};

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

const hasEnvValue = (name: string | null): boolean => {
  if (!name) return false;
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
};
