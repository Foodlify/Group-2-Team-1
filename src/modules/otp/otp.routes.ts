import { Router } from "express";
import { validate } from "../../middlewares/validate.middleware";
import { routeRegistry } from "../../openapi/registry";
import * as controller from "./otp.controller";
import { SendOtpRequestSchema, VerifyOtpRequestSchema } from "./otp.validation";

const router: Router = Router();

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

// ─── OpenAPI ─────────────────────────────────────────────
const tag = "OTP";
const errorRef = { $ref: "#/components/schemas/ErrorResponse" };
const validationErrorRef = {
  $ref: "#/components/schemas/ValidationErrorResponse",
};

const jsonBody = (ref: string) => ({
  required: true,
  content: {
    "application/json": { schema: { $ref: `#/components/schemas/${ref}` } },
  },
});

routeRegistry.push({
  path: "/api/v1/otp/send",
  pathItem: {
    post: {
      tags: [tag],
      summary: "Email a one-time verification code",
      description:
        "Sends a 6-digit code to the given email (registration or password reset). " +
        "At most 3 codes per email per 10 minutes; a new code voids older pending ones. " +
        "The code is only ever delivered by email — never in the response.",
      requestBody: jsonBody("SendOtpRequest"),
      responses: {
        "200": {
          description: "Code emailed",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/OtpSentResponse" },
            },
          },
        },
        "400": {
          description: "Validation failed",
          content: { "application/json": { schema: validationErrorRef } },
        },
        "429": {
          description: "Too many OTP requests for this email",
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
      summary: "Verify a one-time code",
      description:
        "Checks the submitted code against the latest pending code for the " +
        "email+purpose. Codes are single-use and expire after 10 minutes.",
      requestBody: jsonBody("VerifyOtpRequest"),
      responses: {
        "200": { description: "Code verified" },
        "400": {
          description: "Invalid or expired OTP",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});

export default router;
