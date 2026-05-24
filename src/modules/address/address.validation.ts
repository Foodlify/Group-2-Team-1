import { z } from "zod";
import { schemaRegistry } from "../../openapi/registry";

export const UpdateAddressRequestSchema = z
  .object({
    addressLine1: z.string().optional(),
    addressLine2: z.string().optional(),
    city: z.string().optional(),
    postalCode: z.string().optional(),
    country: z.string().optional(),
  })
  .meta({
    id: "UpdateAddressRequest",
    description: "Payload to update an address (all fields optional)",
  });

export const AddressIdParamsSchema = z
  .object({
    customerId: z.string().cuid(),
    addressId: z.string().cuid(),
  })
  .meta({ id: "AddressIdParams" });

schemaRegistry.register("UpdateAddressRequest", UpdateAddressRequestSchema);
schemaRegistry.register("AddressIdParams", AddressIdParamsSchema);

export type UpdateAddressInput = z.infer<typeof UpdateAddressRequestSchema>;
export type AddressIdParams = z.infer<typeof AddressIdParamsSchema>;
