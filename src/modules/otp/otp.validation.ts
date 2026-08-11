import { z } from "zod";
import { schemaRegistry } from "../../openapi/registry";

export const OtpPurposeSchema = z
  .enum(["registration", "password_reset"])
  .meta({ description: "What the code proves" });

export const SendOtpRequestSchema = z
  .object({
    email: z.email().meta({ example: "jane@example.com" }),
    purpose: OtpPurposeSchema,
  })
  .meta({
    id: "SendOtpRequest",
    description: "Request an OTP to be emailed",
  });

export const VerifyOtpRequestSchema = z
  .object({
    email: z.email().meta({ example: "jane@example.com" }),
    code: z
      .string()
      .length(6)
      .regex(/^\d{6}$/, "Code must be 6 digits")
      .meta({ example: "482913" }),
    purpose: OtpPurposeSchema,
  })
  .meta({
    id: "VerifyOtpRequest",
    description: "Verify a previously emailed OTP code",
  });

export const OtpSentResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({
      expiresAt: z.iso.datetime(),
    }),
  })
  .meta({ id: "OtpSentResponse" });

schemaRegistry.register("SendOtpRequest", SendOtpRequestSchema);
schemaRegistry.register("VerifyOtpRequest", VerifyOtpRequestSchema);
schemaRegistry.register("OtpSentResponse", OtpSentResponseSchema);

export type OtpPurpose = z.infer<typeof OtpPurposeSchema>;
export type SendOtpInput = z.infer<typeof SendOtpRequestSchema>;
export type VerifyOtpInput = z.infer<typeof VerifyOtpRequestSchema>;
