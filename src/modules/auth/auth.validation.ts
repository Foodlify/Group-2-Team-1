import z from "zod";
import { schemaRegistry } from "../../openapi/registry";

export const LoginRequestSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(6),
  })
  .meta({ id: "LoginRequest", description: "Payload to login" });

export const RegisterRequestSchema = z
  .object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
  })
  .meta({
    id: "RegisterRequest",
    description: "Payload to register a new user",
  });

export const RefreshTokenRequestSchema = z
  .object({
    refreshToken: z.string(),
  })
  .meta({
    id: "RefreshTokenRequest",
    description: "Payload to refresh or revoke a token",
  });

export const AuthResponseSchema = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string(),
    user: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
      role: z.string(),
    }),
  })
  .meta({
    id: "AuthResponse",
    description: "Authentication response with tokens and user data",
  });

export const RefreshResponseSchema = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string(),
  })
  .meta({
    id: "RefreshResponse",
    description: "New access token and rotated refresh token",
  });

schemaRegistry.register("LoginRequest", LoginRequestSchema);
schemaRegistry.register("RegisterRequest", RegisterRequestSchema);
schemaRegistry.register("RefreshTokenRequest", RefreshTokenRequestSchema);
schemaRegistry.register("AuthResponse", AuthResponseSchema);
schemaRegistry.register("RefreshResponse", RefreshResponseSchema);

export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export type RefreshTokenRequest = z.infer<typeof RefreshTokenRequestSchema>;
