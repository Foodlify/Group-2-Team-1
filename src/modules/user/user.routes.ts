import type { Router } from "express";
import { defineRoutes } from "../../openapi/route-builder";
import {
  ErrorResponseSchema,
  ValidationErrorResponseSchema,
} from "../../shared/schemas/error.schema";
import { PaginationQuerySchema } from "../../shared/schemas/pagination.schema";
import * as controller from "./user.controller";
import {
  AdminLoginRequestSchema,
  AuthUserResponseSchema,
  CreateUserRequestSchema,
  LoginRequestSchema,
  RegisterRequestSchema,
  UpdateUserRequestSchema,
  UserIdParamsSchema,
  UserListSuccessResponseSchema,
  UserSuccessResponseSchema,
} from "./user.validation";

// ─── Auth router (mounted at /api/v1/auth) — all routes public ──
export const authRouter: Router = defineRoutes({
  basePath: "/api/v1/auth",
  tag: "Auth",
  routes: [
    {
      method: "post",
      path: "/register",
      summary: "Register a new customer (sets auth cookies)",
      request: { body: RegisterRequestSchema },
      responses: {
        201: { description: "Registered", schema: AuthUserResponseSchema },
        400: { description: "Validation failed", schema: ValidationErrorResponseSchema },
        409: { description: "Email or phone already registered", schema: ErrorResponseSchema },
      },
      handler: controller.register,
    },
    {
      method: "post",
      path: "/login",
      summary: "Customer login (sets auth cookies)",
      request: { body: LoginRequestSchema },
      responses: {
        200: { description: "Logged in", schema: AuthUserResponseSchema },
        401: { description: "Invalid credentials", schema: ErrorResponseSchema },
      },
      handler: controller.login,
    },
    {
      method: "post",
      path: "/refresh-token",
      summary: "Rotate tokens using the refresh cookie",
      responses: {
        200: { description: "Refreshed", schema: AuthUserResponseSchema },
        401: { description: "Invalid refresh token", schema: ErrorResponseSchema },
      },
      handler: controller.refresh,
    },
    {
      method: "post",
      path: "/logout",
      summary: "Logout (clears cookies, revokes refresh token via refresh cookie)",
      responses: {
        200: { description: "Logged out" },
      },
      handler: controller.logout,
    },
    {
      method: "post",
      path: "/admin/login",
      summary: "Admin login — requires role ADMIN (sets auth cookies)",
      request: { body: AdminLoginRequestSchema },
      responses: {
        200: { description: "Logged in", schema: AuthUserResponseSchema },
        401: { description: "Invalid credentials / not an admin", schema: ErrorResponseSchema },
      },
      handler: controller.adminLogin,
    },
    {
      method: "post",
      path: "/admin/refresh-token",
      summary: "Rotate admin tokens using the refresh cookie",
      responses: {
        200: { description: "Refreshed", schema: AuthUserResponseSchema },
        401: { description: "Invalid refresh token", schema: ErrorResponseSchema },
      },
      handler: controller.refresh,
    },
    {
      method: "post",
      path: "/admin/logout",
      summary: "Admin logout (clears cookies, revokes refresh token)",
      responses: {
        200: { description: "Logged out" },
      },
      handler: controller.logout,
    },
  ],
});

// ─── Users router (mounted at /api/v1/users, ADMIN only) ──
export const usersRouter: Router = defineRoutes({
  basePath: "/api/v1/users",
  tag: "Users",
  routes: [
    {
      method: "get",
      path: "/",
      auth: ["ADMIN"],
      summary: "List users (ADMIN, paginated)",
      request: { query: PaginationQuerySchema },
      responses: {
        200: { description: "Users", schema: UserListSuccessResponseSchema },
        403: { description: "Forbidden", schema: ErrorResponseSchema },
      },
      handler: controller.listUsers,
    },
    {
      method: "post",
      path: "/",
      auth: ["ADMIN"],
      summary: "Create a user (ADMIN)",
      request: { body: CreateUserRequestSchema },
      responses: {
        201: { description: "Created", schema: UserSuccessResponseSchema },
        409: { description: "Email already registered", schema: ErrorResponseSchema },
      },
      handler: controller.createUser,
    },
    {
      method: "get",
      path: "/:id",
      auth: ["ADMIN"],
      summary: "Get a user by ID (ADMIN)",
      request: { params: UserIdParamsSchema },
      responses: {
        200: { description: "User", schema: UserSuccessResponseSchema },
        404: { description: "Not found", schema: ErrorResponseSchema },
      },
      handler: controller.getUser,
    },
    {
      method: "patch",
      path: "/:id",
      auth: ["ADMIN"],
      summary: "Update a user (ADMIN)",
      request: { params: UserIdParamsSchema, body: UpdateUserRequestSchema },
      responses: {
        200: { description: "Updated", schema: UserSuccessResponseSchema },
        404: { description: "Not found", schema: ErrorResponseSchema },
      },
      handler: controller.updateUser,
    },
    {
      method: "delete",
      path: "/:id",
      auth: ["ADMIN"],
      summary: "Delete a user (ADMIN)",
      request: { params: UserIdParamsSchema },
      responses: {
        200: { description: "Deleted" },
        404: { description: "Not found", schema: ErrorResponseSchema },
      },
      handler: controller.deleteUser,
    },
  ],
});
