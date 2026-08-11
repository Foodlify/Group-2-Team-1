import { z } from "zod";
import { schemaRegistry } from "../../openapi/registry";
import { PAYMENT_METHODS } from "../transaction/transaction.model";

export const UpdateCustomerRequestSchema = z
  .object({
    name: z
      .string()
      .min(2)
      .optional()
      .meta({ description: "Display name", example: "Jane Doe" }),
    phone: z
      .string()
      .min(6)
      .optional()
      .meta({ description: "Unique phone", example: "+201000000000" }),
  })
  .meta({
    id: "UpdateCustomerRequest",
    description: "Update the current customer's profile",
  });

export const CreateAddressRequestSchema = z
  .object({
    addressLine1: z.string().min(1).meta({ example: "12 Tahrir St" }),
    addressLine2: z.string().min(1).optional().meta({ example: "Apt 4" }),
    city: z.string().min(1).meta({ example: "Cairo" }),
    postalCode: z.string().min(1).meta({ example: "11511" }),
    country: z.string().min(1).meta({ example: "Egypt" }),
  })
  .meta({ id: "CreateAddressRequest", description: "Add a delivery address" });

export const UpdateAddressRequestSchema = z
  .object({
    addressLine1: z.string().min(1).optional(),
    addressLine2: z.string().min(1).nullable().optional(),
    city: z.string().min(1).optional(),
    postalCode: z.string().min(1).optional(),
    country: z.string().min(1).optional(),
  })
  .meta({
    id: "UpdateAddressRequest",
    description: "Update an address (partial)",
  });

export const AddressIdParamsSchema = z
  .object({
    addressId: z
      .cuid2()
      .meta({ description: "Address ID", example: "clxyz..." }),
  })
  .meta({ id: "AddressIdParams" });

export const CustomerResponseSchema = z
  .object({
    id: z.cuid2(),
    userId: z.cuid2(),
    user: z.object({ name: z.string(), email: z.email() }),
    phone: z
      .string()
      .nullable()
      .meta({
        description:
          "Null for an account created through Google sign-in, which supplies no " +
          "phone number. Add one with PATCH /customers/me.",
      }),
    addressesCount: z.number().int().nonnegative(),
    ordersCount: z.number().int().nonnegative(),
    hasCart: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "CustomerResponse" });

export const AddressResponseSchema = z
  .object({
    id: z.cuid2(),
    customerId: z.cuid2(),
    addressLine1: z.string(),
    addressLine2: z.string().nullable(),
    city: z.string(),
    postalCode: z.string(),
    country: z.string(),
    isDefault: z.boolean().meta({
      description:
        "Pre-selected address at checkout — set via PATCH /me/addresses/{addressId}/default",
    }),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "AddressResponse" });

export const CustomerSuccessResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: CustomerResponseSchema,
  })
  .meta({ id: "CustomerSuccessResponse" });

export const AddressSuccessResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: AddressResponseSchema,
  })
  .meta({ id: "AddressSuccessResponse" });

export const AddressListSuccessResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.array(AddressResponseSchema),
  })
  .meta({ id: "AddressListSuccessResponse" });

schemaRegistry.register("UpdateCustomerRequest", UpdateCustomerRequestSchema);
schemaRegistry.register("CreateAddressRequest", CreateAddressRequestSchema);
schemaRegistry.register("UpdateAddressRequest", UpdateAddressRequestSchema);
schemaRegistry.register("AddressIdParams", AddressIdParamsSchema);
schemaRegistry.register("CustomerResponse", CustomerResponseSchema);
schemaRegistry.register("AddressResponse", AddressResponseSchema);
schemaRegistry.register(
  "CustomerSuccessResponse",
  CustomerSuccessResponseSchema,
);
schemaRegistry.register("AddressSuccessResponse", AddressSuccessResponseSchema);
schemaRegistry.register(
  "AddressListSuccessResponse",
  AddressListSuccessResponseSchema,
);

export type UpdateCustomerInput = z.infer<typeof UpdateCustomerRequestSchema>;
export type CreateAddressInput = z.infer<typeof CreateAddressRequestSchema>;
export type UpdateAddressInput = z.infer<typeof UpdateAddressRequestSchema>;
export type AddressIdParams = z.infer<typeof AddressIdParamsSchema>;
export type CustomerResponse = z.infer<typeof CustomerResponseSchema>;
export type AddressResponse = z.infer<typeof AddressResponseSchema>;

export const CreatePaymentSettingRequestSchema = z
  .object({
    method: z.enum(PAYMENT_METHODS).meta({
      description:
        "Payment method to save as a preference. Only the method is stored — card/wallet details live with the payment gateway. Checkout currently charges CASH only.",
      example: "CASH",
    }),
  })
  .meta({
    id: "CreatePaymentSettingRequest",
    description: "Save a payment method preference",
  });

export const PaymentSettingIdParamsSchema = z
  .object({
    settingId: z
      .cuid2()
      .meta({ description: "Payment setting ID", example: "clxyz..." }),
  })
  .meta({ id: "PaymentSettingIdParams" });

export const PaymentSettingResponseSchema = z
  .object({
    id: z.cuid2(),
    customerId: z.cuid2(),
    method: z.enum(PAYMENT_METHODS),
    isDefault: z.boolean().meta({
      description:
        "Pre-selected method at checkout — set via PATCH /me/payment-settings/{settingId}/default",
    }),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "PaymentSettingResponse" });

export const PaymentSettingSuccessResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: PaymentSettingResponseSchema,
  })
  .meta({ id: "PaymentSettingSuccessResponse" });

export const PaymentSettingListSuccessResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.array(PaymentSettingResponseSchema),
  })
  .meta({ id: "PaymentSettingListSuccessResponse" });

schemaRegistry.register(
  "CreatePaymentSettingRequest",
  CreatePaymentSettingRequestSchema,
);
schemaRegistry.register("PaymentSettingIdParams", PaymentSettingIdParamsSchema);
schemaRegistry.register("PaymentSettingResponse", PaymentSettingResponseSchema);
schemaRegistry.register(
  "PaymentSettingSuccessResponse",
  PaymentSettingSuccessResponseSchema,
);
schemaRegistry.register(
  "PaymentSettingListSuccessResponse",
  PaymentSettingListSuccessResponseSchema,
);

export type CreatePaymentSettingInput = z.infer<
  typeof CreatePaymentSettingRequestSchema
>;
export type PaymentSettingIdParams = z.infer<
  typeof PaymentSettingIdParamsSchema
>;
export type PaymentSettingResponse = z.infer<
  typeof PaymentSettingResponseSchema
>;
