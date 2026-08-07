import { Router } from "express";
import { validate } from "../../middlewares/validate.middleware";
import { authenticate } from "../../middlewares/auth.middleware";
import { routeRegistry } from "../../openapi/registry";
import * as controller from "./customer.controller";
import {
  AddressIdParamsSchema,
  CreateAddressRequestSchema,
  CreatePaymentSettingRequestSchema,
  PaymentSettingIdParamsSchema,
  UpdateAddressRequestSchema,
  UpdateCustomerRequestSchema,
} from "./customer.validation";

const router: Router = Router();

// All customer routes require an authenticated user.
router.use(authenticate);

// ─── Profile ─────────────────────────────────────────────
router.get("/me", controller.getMe);
router.patch(
  "/me",
  validate({ body: UpdateCustomerRequestSchema }),
  controller.updateMe,
);

// ─── Addresses ───────────────────────────────────────────
router.get("/me/addresses", controller.listAddresses);
router.post(
  "/me/addresses",
  validate({ body: CreateAddressRequestSchema }),
  controller.addAddress,
);
router.patch(
  "/me/addresses/:addressId",
  validate({ params: AddressIdParamsSchema, body: UpdateAddressRequestSchema }),
  controller.updateAddress,
);
router.delete(
  "/me/addresses/:addressId",
  validate({ params: AddressIdParamsSchema }),
  controller.deleteAddress,
);
router.patch(
  "/me/addresses/:addressId/default",
  validate({ params: AddressIdParamsSchema }),
  controller.setDefaultAddress,
);

// ─── Preferred payment settings ──────────────────────────
router.get("/me/payment-settings", controller.listPaymentSettings);
router.post(
  "/me/payment-settings",
  validate({ body: CreatePaymentSettingRequestSchema }),
  controller.addPaymentSetting,
);
router.patch(
  "/me/payment-settings/:settingId/default",
  validate({ params: PaymentSettingIdParamsSchema }),
  controller.setDefaultPaymentSetting,
);
router.delete(
  "/me/payment-settings/:settingId",
  validate({ params: PaymentSettingIdParamsSchema }),
  controller.deletePaymentSetting,
);

// ─── OpenAPI Documentation ───────────────────────────────
const tag = "Customer";
const errorRef = { $ref: "#/components/schemas/ErrorResponse" };
const validationErrorRef = {
  $ref: "#/components/schemas/ValidationErrorResponse",
};
// Cookie is the primary transport; Bearer header is the documented fallback.
const security: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { BearerAuth: [] },
];
const addressIdParam = {
  name: "addressId",
  in: "path",
  required: true,
  schema: { type: "string" as const },
} as const;
const jsonRef = (ref: string) => ({
  "application/json": { schema: { $ref: `#/components/schemas/${ref}` } },
});

routeRegistry.push({
  path: "/api/v1/customers/me",
  pathItem: {
    get: {
      tags: [tag],
      summary: "Get my customer profile",
      security,
      responses: {
        "200": {
          description: "Profile",
          content: jsonRef("CustomerSuccessResponse"),
        },
        "403": {
          description: "Not a customer account",
          content: jsonRef("ErrorResponse"),
        },
      },
    },
    patch: {
      tags: [tag],
      summary: "Update my profile (name / phone)",
      security,
      requestBody: {
        required: true,
        content: jsonRef("UpdateCustomerRequest"),
      },
      responses: {
        "200": {
          description: "Updated",
          content: jsonRef("CustomerSuccessResponse"),
        },
        "400": {
          description: "Validation failed",
          content: { "application/json": { schema: validationErrorRef } },
        },
        "409": {
          description: "Phone already registered",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/customers/me/addresses",
  pathItem: {
    get: {
      tags: [tag],
      summary: "List my addresses",
      security,
      responses: {
        "200": {
          description: "Addresses",
          content: jsonRef("AddressListSuccessResponse"),
        },
      },
    },
    post: {
      tags: [tag],
      summary: "Add an address",
      security,
      requestBody: { required: true, content: jsonRef("CreateAddressRequest") },
      responses: {
        "201": {
          description: "Created",
          content: jsonRef("AddressSuccessResponse"),
        },
        "400": {
          description: "Validation failed",
          content: { "application/json": { schema: validationErrorRef } },
        },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/customers/me/addresses/{addressId}",
  pathItem: {
    patch: {
      tags: [tag],
      summary: "Update one of my addresses",
      security,
      parameters: [addressIdParam],
      requestBody: { required: true, content: jsonRef("UpdateAddressRequest") },
      responses: {
        "200": {
          description: "Updated",
          content: jsonRef("AddressSuccessResponse"),
        },
        "403": {
          description: "Address not yours",
          content: { "application/json": { schema: errorRef } },
        },
        "404": {
          description: "Address not found",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
    delete: {
      tags: [tag],
      summary: "Delete one of my addresses",
      security,
      parameters: [addressIdParam],
      responses: {
        "200": {
          description:
            "Deleted (deleting the default promotes the newest remaining address)",
        },
        "403": {
          description: "Address not yours",
          content: { "application/json": { schema: errorRef } },
        },
        "404": {
          description: "Address not found",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});

const settingIdParam = {
  name: "settingId",
  in: "path",
  required: true,
  schema: { type: "string" as const },
} as const;

routeRegistry.push({
  path: "/api/v1/customers/me/payment-settings",
  pathItem: {
    get: {
      tags: [tag],
      summary: "List my saved payment settings",
      security,
      responses: {
        "200": {
          description: "Payment settings, oldest first",
          content: jsonRef("PaymentSettingListSuccessResponse"),
        },
      },
    },
    post: {
      tags: [tag],
      summary: "Save a payment method preference",
      description:
        "Stores only the method — card/wallet details live with the payment gateway, never in our DB. The first saved method becomes the default automatically.",
      security,
      requestBody: {
        required: true,
        content: jsonRef("CreatePaymentSettingRequest"),
      },
      responses: {
        "201": {
          description: "Saved",
          content: jsonRef("PaymentSettingSuccessResponse"),
        },
        "400": {
          description: "Validation failed",
          content: { "application/json": { schema: validationErrorRef } },
        },
        "409": {
          description: "Method already saved",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/customers/me/payment-settings/{settingId}",
  pathItem: {
    delete: {
      tags: [tag],
      summary: "Delete one of my payment settings",
      security,
      parameters: [settingIdParam],
      responses: {
        "200": {
          description:
            "Deleted (deleting the default promotes the newest remaining setting)",
        },
        "403": {
          description: "Setting not yours",
          content: { "application/json": { schema: errorRef } },
        },
        "404": {
          description: "Setting not found",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/customers/me/payment-settings/{settingId}/default",
  pathItem: {
    patch: {
      tags: [tag],
      summary: "Set one of my payment settings as the default",
      description:
        "The default is only the pre-selected method at checkout — every transaction still records the method actually used.",
      security,
      parameters: [settingIdParam],
      responses: {
        "200": {
          description: "Default set",
          content: jsonRef("PaymentSettingSuccessResponse"),
        },
        "403": {
          description: "Setting not yours",
          content: { "application/json": { schema: errorRef } },
        },
        "404": {
          description: "Setting not found",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/customers/me/addresses/{addressId}/default",
  pathItem: {
    patch: {
      tags: [tag],
      summary: "Set one of my addresses as the default",
      description:
        "The default is only the pre-selected choice at checkout — every order still records its own addressId, so a different address can be picked per order.",
      security,
      parameters: [addressIdParam],
      responses: {
        "200": {
          description: "Default set",
          content: jsonRef("AddressSuccessResponse"),
        },
        "403": {
          description: "Address not yours",
          content: { "application/json": { schema: errorRef } },
        },
        "404": {
          description: "Address not found",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});

export default router;
