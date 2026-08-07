import { Router } from "express";
import { validate } from "../../middlewares/validate.middleware";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { routeRegistry } from "../../openapi/registry";
import { PaginationQuerySchema } from "../../shared/schemas/pagination.schema";
import * as controller from "./user.controller";
import {
  AdminLoginRequestSchema,
  CreateUserRequestSchema,
  ForgotPasswordRequestSchema,
  LoginRequestSchema,
  RegisterRequestSchema,
  ResetPasswordRequestSchema,
  UpdateUserRequestSchema,
  UpdateUserStatusRequestSchema,
  UserIdParamsSchema,
  VerifyEmailRequestSchema,
} from "./user.validation";

// ─── Auth router (mounted at /api/v1/auth) ───────────────
export const authRouter: Router = Router();

authRouter.post(
  "/register",
  validate({ body: RegisterRequestSchema }),
  controller.register,
);
authRouter.post(
  "/login",
  validate({ body: LoginRequestSchema }),
  controller.login,
);
// Completes registration and logs the account in.
authRouter.post(
  "/verify-email",
  validate({ body: VerifyEmailRequestSchema }),
  controller.verifyEmail,
);
authRouter.post("/refresh-token", controller.refresh);
// Logout revokes via the refresh cookie — no valid access token required.
authRouter.post("/logout", controller.logout);
// Self-service "Account Deactivate".
authRouter.post("/deactivate", authenticate, controller.deactivateMyAccount);
// Forgot-password flow — both behind the same strict auth limiter.
authRouter.post(
  "/forgot-password",
  validate({ body: ForgotPasswordRequestSchema }),
  controller.forgotPassword,
);
authRouter.post(
  "/reset-password",
  validate({ body: ResetPasswordRequestSchema }),
  controller.resetPassword,
);

authRouter.post(
  "/admin/login",
  validate({ body: AdminLoginRequestSchema }),
  controller.adminLogin,
);
authRouter.post("/admin/refresh-token", controller.refresh);
authRouter.post("/admin/logout", controller.logout);

// ─── Users router (mounted at /api/v1/users, ADMIN only) ──
export const usersRouter: Router = Router();

usersRouter.use(authenticate, authorize("ADMIN"));

usersRouter.get(
  "/",
  validate({ query: PaginationQuerySchema }),
  controller.listUsers,
);
usersRouter.post(
  "/",
  validate({ body: CreateUserRequestSchema }),
  controller.createUser,
);
usersRouter.get(
  "/:id",
  validate({ params: UserIdParamsSchema }),
  controller.getUser,
);
usersRouter.patch(
  "/:id",
  validate({ params: UserIdParamsSchema, body: UpdateUserRequestSchema }),
  controller.updateUser,
);
usersRouter.delete(
  "/:id",
  validate({ params: UserIdParamsSchema }),
  controller.deleteUser,
);
usersRouter.patch(
  "/:id/status",
  validate({ params: UserIdParamsSchema, body: UpdateUserStatusRequestSchema }),
  controller.setUserStatus,
);

// ─── OpenAPI Documentation ───────────────────────────────
const authTag = "Auth";
const usersTag = "Users";
const errorRef = { $ref: "#/components/schemas/ErrorResponse" };
const validationErrorRef = {
  $ref: "#/components/schemas/ValidationErrorResponse",
};
const authRespRef = { $ref: "#/components/schemas/AuthUserResponse" };
const jsonAuth = { "application/json": { schema: authRespRef } };
const idParam = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string" as const },
} as const;

const jsonBody = (ref: string) => ({
  required: true,
  content: {
    "application/json": { schema: { $ref: `#/components/schemas/${ref}` } },
  },
});

routeRegistry.push({
  path: "/api/v1/auth/register",
  pathItem: {
    post: {
      tags: [authTag],
      summary: "Register a new customer (emails a verification code)",
      description:
        "Creates the account and emails a 6-digit code. No cookies are set — the account is unusable until POST /api/v1/auth/verify-email succeeds.",
      requestBody: jsonBody("RegisterRequest"),
      responses: {
        "201": {
          description: "Registered — verification code sent",
          content: jsonAuth,
        },
        "400": {
          description: "Validation failed",
          content: { "application/json": { schema: validationErrorRef } },
        },
        "409": {
          description: "Email or phone already registered",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/auth/login",
  pathItem: {
    post: {
      tags: [authTag],
      summary: "Customer login (sets auth cookies)",
      requestBody: jsonBody("LoginRequest"),
      responses: {
        "200": { description: "Logged in", content: jsonAuth },
        "401": {
          description: "Invalid credentials",
          content: { "application/json": { schema: errorRef } },
        },
        "403": {
          description: "Email not verified / account disabled",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/auth/refresh-token",
  pathItem: {
    post: {
      tags: [authTag],
      summary: "Rotate tokens using the refresh cookie",
      responses: {
        "200": { description: "Refreshed", content: jsonAuth },
        "401": {
          description: "Invalid refresh token",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/auth/logout",
  pathItem: {
    post: {
      tags: [authTag],
      summary:
        "Logout (clears cookies, revokes refresh token via refresh cookie)",
      security: [{ cookieAuth: [] }],
      responses: { "200": { description: "Logged out" } },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/auth/verify-email",
  pathItem: {
    post: {
      tags: [authTag],
      summary: "Verify the registration code (sets auth cookies)",
      description:
        'Completes registration: proves ownership of the email with the 6-digit code and logs the account in. Resend via POST /api/v1/otp/send with purpose "registration".',
      requestBody: jsonBody("VerifyEmailRequest"),
      responses: {
        "200": { description: "Verified and logged in", content: jsonAuth },
        "400": {
          description: "Invalid or expired code",
          content: { "application/json": { schema: errorRef } },
        },
        "409": {
          description: "Email already verified",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/auth/deactivate",
  pathItem: {
    post: {
      tags: [authTag],
      summary: "Deactivate my own account",
      description:
        "Self-service Account Deactivate: disables the account, revokes every refresh session, and clears the auth cookies. An admin can re-enable it.",
      security: [{ cookieAuth: [] }, { BearerAuth: [] }],
      responses: {
        "200": { description: "Deactivated" },
        "401": {
          description: "Not authenticated",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/users/{id}/status",
  pathItem: {
    patch: {
      tags: [usersTag],
      summary: "Enable or disable an account (ADMIN)",
      description:
        "Disabling revokes every refresh session, so the account is locked out as soon as its access token expires.",
      security: [{ cookieAuth: [] }, { BearerAuth: [] }],
      parameters: [idParam],
      requestBody: jsonBody("UpdateUserStatusRequest"),
      responses: {
        "200": {
          description: "Status updated",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UserSuccessResponse" },
            },
          },
        },
        "403": {
          description: "Forbidden",
          content: { "application/json": { schema: errorRef } },
        },
        "404": {
          description: "Not found",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/auth/forgot-password",
  pathItem: {
    post: {
      tags: [authTag],
      summary: "Start the forgot-password flow (emails a 6-digit code)",
      description:
        "Always returns the same 200 whether or not the email has an account — no user enumeration. Rate limited per IP and per email.",
      requestBody: jsonBody("ForgotPasswordRequest"),
      responses: {
        "200": { description: "Generic acknowledgement" },
        "400": {
          description: "Validation failed",
          content: { "application/json": { schema: validationErrorRef } },
        },
        "429": {
          description: "Too many requests",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/auth/reset-password",
  pathItem: {
    post: {
      tags: [authTag],
      summary: "Complete the forgot-password flow with the emailed code",
      description:
        "Verifies the single-use code, sets the new password, and revokes every refresh session (all devices are logged out).",
      requestBody: jsonBody("ResetPasswordRequest"),
      responses: {
        "200": { description: "Password reset" },
        "400": {
          description: "Invalid or expired code",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/auth/admin/login",
  pathItem: {
    post: {
      tags: [authTag],
      summary: "Admin login — requires role ADMIN (sets auth cookies)",
      requestBody: jsonBody("AdminLoginRequest"),
      responses: {
        "200": { description: "Logged in", content: jsonAuth },
        "401": {
          description: "Invalid credentials / not an admin",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/users",
  pathItem: {
    get: {
      tags: [usersTag],
      summary: "List users (ADMIN, paginated)",
      security: [{ BearerAuth: [] }],
      parameters: [
        { name: "page", in: "query", schema: { type: "integer", default: 1 } },
        {
          name: "limit",
          in: "query",
          schema: { type: "integer", default: 20 },
        },
      ],
      responses: {
        "200": {
          description: "Users",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UserListSuccessResponse" },
            },
          },
        },
        "403": {
          description: "Forbidden",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
    post: {
      tags: [usersTag],
      summary: "Create a user (ADMIN)",
      security: [{ BearerAuth: [] }],
      requestBody: jsonBody("CreateUserRequest"),
      responses: {
        "201": {
          description: "Created",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UserSuccessResponse" },
            },
          },
        },
        "409": {
          description: "Email already registered",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/users/{id}",
  pathItem: {
    get: {
      tags: [usersTag],
      summary: "Get a user by ID (ADMIN)",
      security: [{ BearerAuth: [] }],
      parameters: [idParam],
      responses: {
        "200": {
          description: "User",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UserSuccessResponse" },
            },
          },
        },
        "404": {
          description: "Not found",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
    patch: {
      tags: [usersTag],
      summary: "Update a user (ADMIN)",
      security: [{ BearerAuth: [] }],
      parameters: [idParam],
      requestBody: jsonBody("UpdateUserRequest"),
      responses: {
        "200": {
          description: "Updated",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UserSuccessResponse" },
            },
          },
        },
        "404": {
          description: "Not found",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
    delete: {
      tags: [usersTag],
      summary: "Delete a user (ADMIN)",
      security: [{ BearerAuth: [] }],
      parameters: [idParam],
      responses: {
        "200": { description: "Deleted" },
        "404": {
          description: "Not found",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});
