import { Router } from "express";
import { validate } from "../../middlewares/validate.middleware";
import { authenticate } from "../../middlewares/auth.middleware";
import { routeRegistry } from "../../openapi/registry";
import * as controller from "./auth.controller";
import {
  LoginRequestSchema,
  RegisterRequestSchema,
  RefreshTokenRequestSchema,
} from "./auth.validation";

const router = Router();

router.post("/login", validate({ body: LoginRequestSchema }), controller.login);
router.post(
  "/register",
  validate({ body: RegisterRequestSchema }),
  controller.register,
);
router.post(
  "/refresh",
  validate({ body: RefreshTokenRequestSchema }),
  controller.refresh,
);
router.post(
  "/logout",
  validate({ body: RefreshTokenRequestSchema }),
  controller.logout,
);
router.get("/me", authenticate, controller.getMe);

const tag = "Auth";
const errorRef = { $ref: "#/components/schemas/ErrorResponse" };

routeRegistry.push({
  path: "/api/v1/auth/login",
  pathItem: {
    post: {
      tags: [tag],
      summary: "Login with email and password",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/LoginRequest" },
          },
        },
      },
      responses: {
        "200": {
          description: "Login successful — returns JWT token and user data",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AuthResponse" },
            },
          },
        },
        "401": {
          description: "Invalid email or password",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/auth/refresh",
  pathItem: {
    post: {
      tags: [tag],
      summary: "Refresh access token using a valid refresh token",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/RefreshTokenRequest" },
          },
        },
      },
      responses: {
        "200": {
          description: "New access token issued",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RefreshResponse" },
            },
          },
        },
        "401": {
          description: "Invalid or expired refresh token",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});

export default router;
