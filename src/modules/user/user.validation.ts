import { z } from "zod";
import { schemaRegistry } from "../../openapi/registry";
import {
  PaginationMetaSchema,
  PaginationQuerySchema,
} from "../../shared/schemas/pagination.schema";

// Role values kept as a tuple for z.enum (mirrors the Prisma `Role` enum).
export const ROLES = ["CUSTOMER", "ADMIN"] as const;

// ═══════════════════════════════════════════════════════════════
// Request Schemas (inputs)
// ═══════════════════════════════════════════════════════════════

export const RegisterRequestSchema = z
  .object({
    name: z.string().min(2).meta({ description: "Full name", example: "Jane Doe" }),
    email: z.email().meta({ description: "Unique email", example: "jane@example.com" }),
    password: z.string().min(8).meta({ description: "Min 8 characters", example: "Password123!" }),
    phone: z.string().min(6).meta({ description: "Unique phone", example: "+201000000000" }),
  })
  .meta({ id: "RegisterRequest", description: "Customer registration payload" });

export const LoginRequestSchema = z
  .object({
    email: z.email().meta({ example: "jane@example.com" }),
    password: z.string().min(1).meta({ example: "Password123!" }),
  })
  .meta({ id: "LoginRequest", description: "Customer login payload" });

export const AdminLoginRequestSchema = z
  .object({
    email: z.email().meta({ example: "admin@example.com" }),
    password: z.string().min(1).meta({ example: "Admin123!" }),
  })
  .meta({ id: "AdminLoginRequest", description: "Admin (dashboard) login payload" });

export const CreateUserRequestSchema = z
  .object({
    name: z.string().min(2),
    email: z.email(),
    password: z.string().min(8),
    role: z.enum(ROLES).meta({ description: "Account role", example: "ADMIN" }),
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
  .object({ id: z.cuid2().meta({ description: "User ID", example: "clxyz..." }) })
  .meta({ id: "UserIdParams" });

// ═══════════════════════════════════════════════════════════════
// Response Schemas (outputs)
// ═══════════════════════════════════════════════════════════════

export const UserResponseSchema = z
  .object({
    id: z.cuid2(),
    name: z.string(),
    email: z.email(),
    role: z.enum(ROLES),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "UserResponse" });

/** Auth endpoints return only the user; tokens travel in httpOnly cookies. */
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

// ═══════════════════════════════════════════════════════════════
// Registry
// ═══════════════════════════════════════════════════════════════

schemaRegistry.register("RegisterRequest", RegisterRequestSchema);
schemaRegistry.register("LoginRequest", LoginRequestSchema);
schemaRegistry.register("AdminLoginRequest", AdminLoginRequestSchema);
schemaRegistry.register("CreateUserRequest", CreateUserRequestSchema);
schemaRegistry.register("UpdateUserRequest", UpdateUserRequestSchema);
schemaRegistry.register("UserIdParams", UserIdParamsSchema);
schemaRegistry.register("UserResponse", UserResponseSchema);
schemaRegistry.register("AuthUserResponse", AuthUserResponseSchema);
schemaRegistry.register("UserSuccessResponse", UserSuccessResponseSchema);
schemaRegistry.register("UserListSuccessResponse", UserListSuccessResponseSchema);

// ═══════════════════════════════════════════════════════════════
// TypeScript Types
// ═══════════════════════════════════════════════════════════════

export type RegisterInput = z.infer<typeof RegisterRequestSchema>;
export type LoginInput = z.infer<typeof LoginRequestSchema>;
export type AdminLoginInput = z.infer<typeof AdminLoginRequestSchema>;
export type CreateUserInput = z.infer<typeof CreateUserRequestSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserRequestSchema>;
export type UserIdParams = z.infer<typeof UserIdParamsSchema>;
export type UserResponse = z.infer<typeof UserResponseSchema>;
export type UserQuery = z.infer<typeof PaginationQuerySchema>;
