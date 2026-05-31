import { Router } from "express";
import { validate } from "../../middlewares/validate.middleware";
import { authenticate } from "../../middlewares/auth.middleware";
import { routeRegistry } from "../../openapi/registry";
import * as controller from "./customer.controller";
import {
  AddressIdParamsSchema,
  CreateAddressRequestSchema,
  UpdateAddressRequestSchema,
  UpdateCustomerRequestSchema,
} from "./customer.validation";

const router: Router = Router();

// All customer routes require an authenticated user.
router.use(authenticate);

// ─── Profile ─────────────────────────────────────────────
router.get("/me", controller.getMe);
router.patch("/me", validate({ body: UpdateCustomerRequestSchema }), controller.updateMe);

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

// ─── OpenAPI Documentation ───────────────────────────────
const tag = "Customer";
const errorRef = { $ref: "#/components/schemas/ErrorResponse" };
const validationErrorRef = { $ref: "#/components/schemas/ValidationErrorResponse" };
const security = [{ BearerAuth: [] }];
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
        "200": { description: "Profile", content: jsonRef("CustomerSuccessResponse") },
        "403": { description: "Not a customer account", content: jsonRef("ErrorResponse") },
      },
    },
    patch: {
      tags: [tag],
      summary: "Update my profile (name / phone)",
      security,
      requestBody: { required: true, content: jsonRef("UpdateCustomerRequest") },
      responses: {
        "200": { description: "Updated", content: jsonRef("CustomerSuccessResponse") },
        "400": { description: "Validation failed", content: { "application/json": { schema: validationErrorRef } } },
        "409": { description: "Phone already registered", content: { "application/json": { schema: errorRef } } },
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
        "200": { description: "Addresses", content: jsonRef("AddressListSuccessResponse") },
      },
    },
    post: {
      tags: [tag],
      summary: "Add an address",
      security,
      requestBody: { required: true, content: jsonRef("CreateAddressRequest") },
      responses: {
        "201": { description: "Created", content: jsonRef("AddressSuccessResponse") },
        "400": { description: "Validation failed", content: { "application/json": { schema: validationErrorRef } } },
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
        "200": { description: "Updated", content: jsonRef("AddressSuccessResponse") },
        "403": { description: "Address not yours", content: { "application/json": { schema: errorRef } } },
        "404": { description: "Address not found", content: { "application/json": { schema: errorRef } } },
      },
    },
    delete: {
      tags: [tag],
      summary: "Delete one of my addresses",
      security,
      parameters: [addressIdParam],
      responses: {
        "200": { description: "Deleted" },
        "403": { description: "Address not yours", content: { "application/json": { schema: errorRef } } },
        "404": { description: "Address not found", content: { "application/json": { schema: errorRef } } },
      },
    },
  },
});

export default router;
