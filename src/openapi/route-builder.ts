import { Router, type RequestHandler } from "express";
import type { ZodType } from "zod";
import type {
  ZodOpenApiOperationObject,
  ZodOpenApiResponsesObject,
} from "zod-openapi";
import { authenticate, authorize } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate.middleware";
import { routeRegistry } from "./registry";

/**
 * Single source of truth for routing + OpenAPI.
 *
 * Each route is declared ONCE here. From that one declaration we derive both:
 *   1. the live Express route (auth → authorize → validate → handler), and
 *   2. the OpenAPI operation (security, parameters, request body, responses)
 *      generated directly from the same Zod schemas used for validation.
 *
 * There is no hand-written OpenAPI path spec to drift out of sync — change a
 * Zod schema or a route and the docs update automatically.
 */

type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

/**
 * Auth requirement for a route:
 *  - `"none"` (or omitted): public route.
 *  - `"user"`: any authenticated user (cookie or bearer token).
 *  - `string[]`: authenticated AND holding one of the listed roles.
 */
type RouteAuth = "none" | "user" | string[];

interface RouteResponse {
  description: string;
  /** Zod schema for the response body. Schemas with an `id` meta become `$ref`s. */
  schema?: ZodType;
}

export interface RouteSpec {
  method: HttpMethod;
  /** Express-relative path, e.g. `/`, `/:orderId`, `/:orderId/status`. */
  path: string;
  summary: string;
  description?: string;
  auth?: RouteAuth;
  request?: {
    body?: ZodType;
    query?: ZodType;
    params?: ZodType;
  };
  /** Keyed by HTTP status code. */
  responses: Record<number, RouteResponse>;
  /**
   * Route handler. Typed loosely so controllers that declare specific param
   * shapes (e.g. `Request<OrderIdParams>`) remain assignable — Express params
   * are contravariant, so a generic `RequestHandler` would reject them.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: RequestHandler<any, any, any, any>;
}

export interface ModuleRoutes {
  /** Full OpenAPI path prefix the router is mounted under, e.g. `/api/v1/orders`. */
  basePath: string;
  /** OpenAPI tag grouping these operations. */
  tag: string;
  routes: RouteSpec[];
}

// Cookie is the primary transport; the Bearer header is the documented fallback.
const SECURITY: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { BearerAuth: [] },
];

/** `/:orderId/status` → `/{orderId}/status` (Express → OpenAPI path syntax). */
const expressToOpenApiPath = (path: string): string =>
  path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");

const isProtected = (auth: RouteAuth | undefined): boolean =>
  auth !== undefined && auth !== "none";

const buildResponses = (
  responses: Record<number, RouteResponse>,
): ZodOpenApiResponsesObject => {
  const out: Record<string, unknown> = {};
  for (const [status, res] of Object.entries(responses)) {
    out[status] = {
      description: res.description,
      ...(res.schema
        ? { content: { "application/json": { schema: res.schema } } }
        : {}),
    };
  }
  return out as ZodOpenApiResponsesObject;
};

const buildOperation = (
  route: RouteSpec,
  tag: string,
): ZodOpenApiOperationObject => {
  const operation: ZodOpenApiOperationObject = {
    tags: [tag],
    summary: route.summary,
    responses: buildResponses(route.responses),
  };
  if (route.description) operation.description = route.description;
  if (isProtected(route.auth)) operation.security = SECURITY;

  if (route.request?.body) {
    operation.requestBody = {
      required: true,
      content: { "application/json": { schema: route.request.body } },
    };
  }

  const params: Record<string, ZodType> = {};
  if (route.request?.params) params.path = route.request.params;
  if (route.request?.query) params.query = route.request.query;
  if (Object.keys(params).length > 0) {
    operation.requestParams =
      params as ZodOpenApiOperationObject["requestParams"];
  }

  return operation;
};

/**
 * Builds an Express `Router` from a declarative route list AND registers the
 * matching OpenAPI operations (as a side effect of import, via `routeRegistry`).
 */
export const defineRoutes = (module: ModuleRoutes): Router => {
  const router: Router = Router();

  for (const route of module.routes) {
    // ── Live Express route: auth → authorize → validate → handler ──
    const chain: RequestHandler[] = [];
    if (isProtected(route.auth)) {
      chain.push(authenticate);
      if (Array.isArray(route.auth)) {
        chain.push(authorize(...route.auth));
      }
    }
    if (
      route.request &&
      (route.request.body || route.request.query || route.request.params)
    ) {
      chain.push(
        validate({
          body: route.request.body,
          query: route.request.query,
          params: route.request.params,
        }),
      );
    }
    router[route.method](route.path, ...chain, route.handler);

    // ── OpenAPI operation derived from the same declaration ──
    const relative = expressToOpenApiPath(route.path);
    const fullPath =
      relative === "/" ? module.basePath : `${module.basePath}${relative}`;
    routeRegistry.push({
      path: fullPath,
      pathItem: { [route.method]: buildOperation(route, module.tag) },
    });
  }

  return router;
};
