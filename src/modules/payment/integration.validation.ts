import { z } from "zod";
import { schemaRegistry } from "../../openapi/registry";
import { PAYMENT_METHODS } from "../transaction/transaction.model";

export const IntegrationCodeParamsSchema = z
  .object({
    code: z.string().min(1).meta({
      description: "The integration's machine name",
      example: "stripe",
    }),
  })
  .meta({ id: "IntegrationCodeParams" });

/**
 * Everything an admin may change. Note what is absent: there is no field for a
 * secret key, because none is stored. `secretKeyEnvVar` names the environment
 * variable that holds it.
 */
export const UpdateIntegrationRequestSchema = z
  .object({
    isEnabled: z.boolean().optional().meta({
      description:
        "The kill switch. Read when a payment is taken, so it applies on the next request rather than the next deploy.",
    }),
    displayName: z.string().min(1).optional(),
    currency: z
      .string()
      .length(3)
      .optional()
      .meta({ description: "ISO currency code", example: "EGP" }),
    successUrl: z.url().optional(),
    cancelUrl: z.url().optional(),
    isTestMode: z.boolean().optional().meta({
      description:
        "Whether this points at the provider's sandbox. Recorded rather than inferred — 'are we live?' should not be answered by squinting at a key.",
    }),
    secretKeyEnvVar: z.string().min(1).optional().meta({
      description:
        "NAME of the environment variable holding the secret, never the secret",
      example: "STRIPE_SECRET_KEY",
    }),
    webhookSecretEnvVar: z.string().min(1).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  })
  .meta({
    id: "UpdateIntegrationRequest",
    description:
      "Fields to change on a payment integration. No secret is ever accepted or stored here.",
  });

export const IntegrationResponseSchema = z
  .object({
    code: z.string(),
    displayName: z.string(),
    paymentMethod: z.enum(PAYMENT_METHODS),
    isEnabled: z.boolean(),
    configuration: z
      .object({
        currency: z.string(),
        successUrl: z.string().nullable(),
        cancelUrl: z.string().nullable(),
        isTestMode: z.boolean(),
        secretKeyEnvVar: z.string().nullable(),
        webhookSecretEnvVar: z.string().nullable(),
        /// Derived, not stored — see the mapper.
        secretConfigured: z.boolean().meta({
          description:
            "Whether the named environment variable actually has a value on this deployment. The value itself is never returned.",
        }),
      })
      .nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({
    id: "PaymentIntegration",
    description: "A payment integration and how it is configured",
  });

export const IntegrationListSuccessResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.array(IntegrationResponseSchema),
  })
  .meta({ id: "PaymentIntegrationListSuccessResponse" });

export const IntegrationSuccessResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: IntegrationResponseSchema,
  })
  .meta({ id: "PaymentIntegrationSuccessResponse" });

schemaRegistry.register(
  "UpdateIntegrationRequest",
  UpdateIntegrationRequestSchema,
);
schemaRegistry.register("PaymentIntegration", IntegrationResponseSchema);
schemaRegistry.register(
  "PaymentIntegrationListSuccessResponse",
  IntegrationListSuccessResponseSchema,
);
schemaRegistry.register(
  "PaymentIntegrationSuccessResponse",
  IntegrationSuccessResponseSchema,
);

export type IntegrationCodeParams = z.infer<typeof IntegrationCodeParamsSchema>;
export type UpdateIntegrationInput = z.infer<
  typeof UpdateIntegrationRequestSchema
>;
export type IntegrationResponse = z.infer<typeof IntegrationResponseSchema>;
