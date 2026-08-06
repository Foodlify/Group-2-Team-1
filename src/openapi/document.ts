import { createDocument, type ZodOpenApiObject } from "zod-openapi";
import { routeRegistry, schemaRegistry } from "./registry";
import env from "../config/env";

// Ensure shared schemas are registered
import "../shared/schemas/error.schema";
import "../shared/schemas/pagination.schema";
import "../modules/user/user.validation";
import "../modules/otp/otp.validation";
import "../modules/customer/customer.validation";
import "../modules/rating/rating.validation";
import "../modules/menuItem/menuItem.validation";
import "../modules/menu/menu.validation";
import "../modules/restaurant/restaurant.validation";
import "../modules/cart/cart.validation";
import "../modules/order/order.validation";

// Ensure every route's OpenAPI path is registered too. Routes push into
// `routeRegistry` as a side effect of being imported; importing them here (not
// only via app.ts) makes `buildOpenApiDocument()` deterministic even when
// called outside the Express app (e.g. a spec-generation script). ES modules
// are singletons, so these imports never double-register.
import "../modules/user/user.routes";
import "../modules/otp/otp.routes";
import "../modules/customer/customer.routes";
import "../modules/rating/rating.routes";
import "../modules/restaurant/restaurant.routes";
import "../modules/menu/menu.routes";
import "../modules/menuItem/menuItem.routes";
import "../modules/cart/cart.routes";
import "../modules/order/order.routes";

/**
 * Build the OpenAPI 3.1 document by combining:
 * - registered routes (from each module's routes file)
 * - registered shared schemas (error, pagination, etc.)
 */
export const buildOpenApiDocument = (): ReturnType<typeof createDocument> => {
  // Build paths object from registered routes
  const paths: ZodOpenApiObject["paths"] = {};
  for (const { path, pathItem } of routeRegistry) {
    paths[path] = { ...(paths[path] ?? {}), ...pathItem };
  }

  return createDocument({
    openapi: "3.1.0",
    info: {
      title: "Food Delivery API",
      version: "1.0.0",
      description:
        "REST API for a food delivery platform. Exposes authentication (customer + admin), user management, catalog browsing (restaurants, menus, items), cart, and orders. Authentication uses JWT access/refresh tokens delivered as httpOnly cookies.",
    },
    servers: [
      {
        url: `http://localhost:${env.PORT}`,
        description: "Local development server",
      },
    ],
    components: {
      schemas: schemaRegistry.getAll(),
      securitySchemes: {
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "accessToken",
          description: "httpOnly access-token cookie set on login/register",
        },
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Fallback: JWT access token as a Bearer header",
        },
      },
    },
    paths,
  });
};
