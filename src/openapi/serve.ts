import { apiReference } from "@scalar/express-api-reference";
import type { Application } from "express";
import swaggerUi from "swagger-ui-express";
import { buildOpenApiDocument } from "./document";
import logger from "../config/logger";

export const serveOpenApi = (app: Application): void => {
  const document = buildOpenApiDocument();

  // Raw spec
  app.get("/openapi.json", (_req, res) => {
    res.json(document);
  });

  // Swagger UI (classic) — MUST be registered BEFORE Scalar
  // because Scalar's /api-docs would otherwise match /api-docs/swagger too
  app.use(
    "/api-docs/swagger",
    swaggerUi.serve,
    swaggerUi.setup(document, {
      customSiteTitle: "API Docs (Swagger)",
    }),
  );

  // Scalar UI (modern) — registered last so it handles only /api-docs
  app.use(
    "/api-docs",
    apiReference({
      content: document,
      theme: "default",
      layout: "modern",
    }),
  );

  logger.info("OpenAPI documentation available at:", {
    scalar: "/api-docs",
    swagger: "/api-docs/swagger",
    json: "/openapi.json",
  });
};