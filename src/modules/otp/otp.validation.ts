import z from "zod";
import { schemaRegistry } from "../../openapi/registry";

export const SendOtpRequestSchema = z
  .object({
    email: z.string().email(),
    purpose: z.enum(["registration", "password_reset"]),
  })
  .meta({
    id: "SendOtpRequest",
    description: "Payload to request an OTP be sent to an email",
  });

export const VerifyOtpRequestSchema = z
  .object({
    email: z.string().email(),
    code: z.string().length(6),
    purpose: z.enum(["registration", "password_reset"]),
  })
  .meta({
    id: "VerifyOtpRequest",
    description: "Payload to verify an OTP code",
  });

export const OtpResponseSchema = z
  .object({
    message: z.string(),
    expiresAt: z.string().datetime(),
  })
  .meta({
    id: "OtpResponse",
    description: "OTP operation response with expiry time",
  });

schemaRegistry.register("SendOtpRequest", SendOtpRequestSchema);
schemaRegistry.register("VerifyOtpRequest", VerifyOtpRequestSchema);
schemaRegistry.register("OtpResponse", OtpResponseSchema);

export type SendOtpInput = z.infer<typeof SendOtpRequestSchema>;
export type VerifyOtpInput = z.infer<typeof VerifyOtpRequestSchema>;
