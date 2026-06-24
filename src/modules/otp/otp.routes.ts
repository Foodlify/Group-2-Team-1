import { Router } from "express";
import { validate } from "../../middlewares/validate.middleware";
import { routeRegistry } from "../../openapi/registry";
import * as controller from "./otp.controller";
import { SendOtpRequestSchema, VerifyOtpRequestSchema } from "./otp.validation";

const router = Router();

router.post(
  "/send",
  validate({ body: SendOtpRequestSchema }),
  controller.sendOtp,
);

router.post(
  "/verify",
  validate({ body: VerifyOtpRequestSchema }),
  controller.verifyOtp,
);

const tag = "OTP";
const errorRef = { $ref: "#/components/schemas/ErrorResponse" };

routeRegistry.push({
  path: "/api/v1/otp/send",
  pathItem: {
    post: {
      tags: [tag],
      summary: "Send an OTP code to an email address",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/SendOtpRequest" },
          },
        },
      },
      responses: {
        "200": {
          description: "OTP sent successfully",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/OtpResponse" },
            },
          },
        },
        "400": {
          description: "Validation error",
          content: { "application/json": { schema: errorRef } },
        },
        "429": {
          description: "Rate limit exceeded — too many OTP requests",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/otp/verify",
  pathItem: {
    post: {
      tags: [tag],
      summary: "Verify an OTP code",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/VerifyOtpRequest" },
          },
        },
      },
      responses: {
        "200": {
          description: "OTP verified successfully",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/OtpResponse" },
            },
          },
        },
        "400": {
          description: "Invalid or expired OTP",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});

export default router;
