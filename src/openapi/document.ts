import { createDocument, type ZodOpenApiObject } from "zod-openapi";
import { routeRegistry, schemaRegistry } from "./registry";
import env from "../config/env";

// Ensure shared schemas are registered
import "../shared/schemas/error.schema";
import "../shared/schemas/pagination.schema";
import "../modules/user/user.validation";
import "../modules/menuItem/menuItem.validation";
import "../modules/menu/menu.validation";
import "../modules/restaurant/restaurant.validation";
import "../modules/cart/cart.validation";
import "../modules/order/order.validation";


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
        "REST API for the currently exposed cart workflow in a food delivery platform. Users, restaurants, menus, orders, and payments are planned or internal modules unless routes are explicitly exposed.",
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
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "JWT obtained from /auth/login",
        },
      },
    },
    paths,
  });
};
