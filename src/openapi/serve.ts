import { apiReference } from "@scalar/express-api-reference";
import type { Application } from "express";
import swaggerUi from "swagger-ui-express";
import { buildOpenApiDocument } from "./document";

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

  // Deliberately not logged here. This runs at mount time, before `listen`, so
  // the only addresses it could print are relative ones — and the startup
  // banner in `server.ts` prints them absolute, once the port is actually
  // bound. Two lists of the same paths is one list too many.
};
