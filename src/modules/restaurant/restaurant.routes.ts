import type { Router } from "express";
import { defineRoutes } from "../../openapi/route-builder";
import {
  ErrorResponseSchema,
  ValidationErrorResponseSchema,
} from "../../shared/schemas/error.schema";
import { MenuListSuccessResponseSchema } from "../menu/menu.validation";
import * as controller from "./restaurant.controller";
import {
  CreateRestaurantRequestSchema,
  RestaurantIdParamsSchema,
  RestaurantListSuccessResponseSchema,
  RestaurantQuerySchema,
  RestaurantSuccessResponseSchema,
  UpdateRestaurantRequestSchema,
} from "./restaurant.validation";

const router: Router = defineRoutes({
  basePath: "/api/v1/restaurants",
  tag: "Catalog",
  routes: [
    {
      method: "get",
      path: "/",
      summary: "List restaurants (paginated, optional name search)",
      request: { query: RestaurantQuerySchema },
      responses: {
        200: { description: "Restaurants", schema: RestaurantListSuccessResponseSchema },
      },
      handler: controller.listRestaurants,
    },
    {
      method: "get",
      path: "/:restaurantId",
      summary: "Get a restaurant by ID",
      request: { params: RestaurantIdParamsSchema },
      responses: {
        200: { description: "Restaurant", schema: RestaurantSuccessResponseSchema },
        404: { description: "Restaurant not found", schema: ErrorResponseSchema },
      },
      handler: controller.getRestaurant,
    },
    {
      method: "get",
      path: "/:restaurantId/menus",
      summary: "List a restaurant's menus",
      request: { params: RestaurantIdParamsSchema },
      responses: {
        200: { description: "Menus", schema: MenuListSuccessResponseSchema },
        404: { description: "Restaurant not found", schema: ErrorResponseSchema },
      },
      handler: controller.getRestaurantMenus,
    },
    {
      method: "post",
      path: "/",
      auth: ["ADMIN"],
      summary: "Create a restaurant (ADMIN)",
      request: { body: CreateRestaurantRequestSchema },
      responses: {
        201: { description: "Created", schema: RestaurantSuccessResponseSchema },
        400: { description: "Validation failed", schema: ValidationErrorResponseSchema },
        403: { description: "Forbidden", schema: ErrorResponseSchema },
      },
      handler: controller.createRestaurant,
    },
    {
      method: "patch",
      path: "/:restaurantId",
      auth: ["ADMIN"],
      summary: "Update a restaurant (ADMIN)",
      request: { params: RestaurantIdParamsSchema, body: UpdateRestaurantRequestSchema },
      responses: {
        200: { description: "Updated", schema: RestaurantSuccessResponseSchema },
        403: { description: "Forbidden", schema: ErrorResponseSchema },
        404: { description: "Restaurant not found", schema: ErrorResponseSchema },
      },
      handler: controller.updateRestaurant,
    },
    {
      method: "delete",
      path: "/:restaurantId",
      auth: ["ADMIN"],
      summary: "Delete a restaurant (ADMIN)",
      request: { params: RestaurantIdParamsSchema },
      responses: {
        200: { description: "Deleted" },
        403: { description: "Forbidden", schema: ErrorResponseSchema },
        404: { description: "Restaurant not found", schema: ErrorResponseSchema },
        409: { description: "Restaurant referenced by existing orders", schema: ErrorResponseSchema },
      },
      handler: controller.deleteRestaurant,
    },
  ],
});

export default router;
