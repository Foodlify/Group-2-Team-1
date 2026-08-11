import { z } from "zod";
import { schemaRegistry } from "../../openapi/registry";
import {
  PaginationMetaSchema,
  PaginationQuerySchema,
} from "../../shared/schemas/pagination.schema";
import { MAX_PASSWORD_BYTES } from "../../shared/auth/password.helper";

export const ROLES = ["CUSTOMER", "ADMIN", "RESTAURANT"] as const;

const passwordSchema = (minLength: number) =>
  z
    .string()
    .min(minLength)
    .max(MAX_PASSWORD_BYTES)
    .refine((value) => Buffer.byteLength(value, "utf8") <= MAX_PASSWORD_BYTES, {
      message: `Password must be at most ${MAX_PASSWORD_BYTES} bytes`,
    });

const newPasswordSchema = () => passwordSchema(8);

const loginPasswordSchema = () => passwordSchema(1);

export const RegisterRequestSchema = z
  .object({
    name: z
      .string()
      .min(2)
      .meta({ description: "Full name", example: "Jane Doe" }),
    email: z
      .email()
      .meta({ description: "Unique email", example: "jane@example.com" }),
    password: newPasswordSchema().meta({
      description: "8 characters minimum, 72 bytes maximum",
      example: "Password123!",
    }),
    phone: z
      .string()
      .min(6)
      .meta({ description: "Unique phone", example: "+201000000000" }),
  })
  .meta({
    id: "RegisterRequest",
    description: "Customer registration payload",
  });

export const LoginRequestSchema = z
  .object({
    email: z.email().meta({ example: "jane@example.com" }),
    password: loginPasswordSchema().meta({ example: "Password123!" }),
  })
  .meta({ id: "LoginRequest", description: "Customer login payload" });

export const AdminLoginRequestSchema = z
  .object({
    email: z.email().meta({ example: "admin@example.com" }),
    password: loginPasswordSchema().meta({ example: "Admin123!" }),
  })
  .meta({
    id: "AdminLoginRequest",
    description: "Admin (dashboard) login payload",
  });

export const CreateUserRequestSchema = z
  .object({
    name: z.string().min(2),
    email: z.email(),
    password: newPasswordSchema(),
    role: z.enum(ROLES).meta({ description: "Account role", example: "ADMIN" }),
    phone: z.string().min(6).optional().meta({
      description:
        "Required when role is CUSTOMER (a Customer profile is created)",
      example: "+201000000000",
    }),
  })
  .meta({ id: "CreateUserRequest", description: "Admin-created user payload" });

export const UpdateUserRequestSchema = z
  .object({
    name: z.string().min(2).optional(),
    email: z.email().optional(),
    role: z.enum(ROLES).optional(),
  })
  .meta({ id: "UpdateUserRequest", description: "Fields to update on a user" });

export const UserIdParamsSchema = z
  .object({
    id: z.cuid2().meta({ description: "User ID", example: "clxyz..." }),
  })
  .meta({ id: "UserIdParams" });

export const UserResponseSchema = z
  .object({
    id: z.cuid2(),
    name: z.string(),
    email: z.email(),
    role: z.enum(ROLES),
    isActive: z.boolean().meta({
      description:
        "False when the account is disabled (admin) or deactivated (self)",
    }),
    emailVerified: z.boolean().meta({
      description:
        "True once the registration code proved ownership of the email",
    }),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "UserResponse" });

export const AuthUserResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({ user: UserResponseSchema }),
  })
  .meta({ id: "AuthUserResponse" });

export const UserSuccessResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: UserResponseSchema,
  })
  .meta({ id: "UserSuccessResponse" });

export const UserListSuccessResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.array(UserResponseSchema),
    meta: PaginationMetaSchema,
  })
  .meta({ id: "UserListSuccessResponse" });

export const VerifyEmailRequestSchema = z
  .object({
    email: z.email().meta({ example: "jane@example.com" }),
    code: z
      .string()
      .regex(/^\d{6}$/)
      .meta({
        description: "The 6-digit code from the email",
        example: "123456",
      }),
  })
  .meta({
    id: "VerifyEmailRequest",
    description: "Complete registration with the emailed code",
  });

export const UpdateUserStatusRequestSchema = z
  .object({
    isActive: z.boolean().meta({
      description: "false disables the account and revokes all its sessions",
      example: false,
    }),
  })
  .meta({ id: "UpdateUserStatusRequest" });

export const ForgotPasswordRequestSchema = z
  .object({
    email: z.email().meta({ example: "jane@example.com" }),
  })
  .meta({
    id: "ForgotPasswordRequest",
    description:
      "Start the forgot-password flow — a reset code is emailed when the address has an account",
  });

export const ResetPasswordRequestSchema = z
  .object({
    email: z.email().meta({ example: "jane@example.com" }),
    code: z
      .string()
      .regex(/^\d{6}$/)
      .meta({
        description: "The 6-digit code from the email",
        example: "123456",
      }),
    newPassword: newPasswordSchema().meta({
      description: "8 characters minimum, 72 bytes maximum",
      example: "NewPassword123!",
    }),
  })
  .meta({
    id: "ResetPasswordRequest",
    description: "Complete the forgot-password flow with the emailed code",
  });

schemaRegistry.register("ForgotPasswordRequest", ForgotPasswordRequestSchema);
schemaRegistry.register("ResetPasswordRequest", ResetPasswordRequestSchema);
schemaRegistry.register("VerifyEmailRequest", VerifyEmailRequestSchema);
schemaRegistry.register(
  "UpdateUserStatusRequest",
  UpdateUserStatusRequestSchema,
);
schemaRegistry.register("RegisterRequest", RegisterRequestSchema);
schemaRegistry.register("LoginRequest", LoginRequestSchema);
schemaRegistry.register("AdminLoginRequest", AdminLoginRequestSchema);
schemaRegistry.register("CreateUserRequest", CreateUserRequestSchema);
schemaRegistry.register("UpdateUserRequest", UpdateUserRequestSchema);
schemaRegistry.register("UserIdParams", UserIdParamsSchema);
schemaRegistry.register("UserResponse", UserResponseSchema);
schemaRegistry.register("AuthUserResponse", AuthUserResponseSchema);
schemaRegistry.register("UserSuccessResponse", UserSuccessResponseSchema);
schemaRegistry.register(
  "UserListSuccessResponse",
  UserListSuccessResponseSchema,
);

export type RegisterInput = z.infer<typeof RegisterRequestSchema>;
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordRequestSchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordRequestSchema>;
export type VerifyEmailInput = z.infer<typeof VerifyEmailRequestSchema>;
export type UpdateUserStatusInput = z.infer<
  typeof UpdateUserStatusRequestSchema
>;
export type LoginInput = z.infer<typeof LoginRequestSchema>;
export type AdminLoginInput = z.infer<typeof AdminLoginRequestSchema>;
export type CreateUserInput = z.infer<typeof CreateUserRequestSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserRequestSchema>;
export type UserIdParams = z.infer<typeof UserIdParamsSchema>;
export type UserResponse = z.infer<typeof UserResponseSchema>;
export type UserQuery = z.infer<typeof PaginationQuerySchema>;
