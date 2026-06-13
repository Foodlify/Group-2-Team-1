import type { Router } from "express";
import { defineRoutes } from "../../openapi/route-builder";
import {
  ErrorResponseSchema,
  ValidationErrorResponseSchema,
} from "../../shared/schemas/error.schema";
import * as controller from "./customer.controller";
import {
  AddressIdParamsSchema,
  AddressListSuccessResponseSchema,
  AddressSuccessResponseSchema,
  CreateAddressRequestSchema,
  CustomerSuccessResponseSchema,
  UpdateAddressRequestSchema,
  UpdateCustomerRequestSchema,
} from "./customer.validation";

const router: Router = defineRoutes({
  basePath: "/api/v1/customers",
  tag: "Customer",
  routes: [
    {
      method: "get",
      path: "/me",
      auth: "user",
      summary: "Get my customer profile",
      responses: {
        200: { description: "Profile", schema: CustomerSuccessResponseSchema },
        403: { description: "Not a customer account", schema: ErrorResponseSchema },
      },
      handler: controller.getMe,
    },
    {
      method: "patch",
      path: "/me",
      auth: "user",
      summary: "Update my profile (name / phone)",
      request: { body: UpdateCustomerRequestSchema },
      responses: {
        200: { description: "Updated", schema: CustomerSuccessResponseSchema },
        400: { description: "Validation failed", schema: ValidationErrorResponseSchema },
        409: { description: "Phone already registered", schema: ErrorResponseSchema },
      },
      handler: controller.updateMe,
    },
    {
      method: "get",
      path: "/me/addresses",
      auth: "user",
      summary: "List my addresses",
      responses: {
        200: { description: "Addresses", schema: AddressListSuccessResponseSchema },
      },
      handler: controller.listAddresses,
    },
    {
      method: "post",
      path: "/me/addresses",
      auth: "user",
      summary: "Add an address",
      request: { body: CreateAddressRequestSchema },
      responses: {
        201: { description: "Created", schema: AddressSuccessResponseSchema },
        400: { description: "Validation failed", schema: ValidationErrorResponseSchema },
      },
      handler: controller.addAddress,
    },
    {
      method: "patch",
      path: "/me/addresses/:addressId",
      auth: "user",
      summary: "Update one of my addresses",
      request: { params: AddressIdParamsSchema, body: UpdateAddressRequestSchema },
      responses: {
        200: { description: "Updated", schema: AddressSuccessResponseSchema },
        403: { description: "Address not yours", schema: ErrorResponseSchema },
        404: { description: "Address not found", schema: ErrorResponseSchema },
      },
      handler: controller.updateAddress,
    },
    {
      method: "delete",
      path: "/me/addresses/:addressId",
      auth: "user",
      summary: "Delete one of my addresses",
      request: { params: AddressIdParamsSchema },
      responses: {
        200: { description: "Deleted" },
        403: { description: "Address not yours", schema: ErrorResponseSchema },
        404: { description: "Address not found", schema: ErrorResponseSchema },
      },
      handler: controller.deleteAddress,
    },
  ],
});

export default router;
