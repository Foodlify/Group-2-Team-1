/**
 * Central registries used by the OpenAPI document generator.
 *
 * - `routeRegistry`: collects route definitions from every module's routes file.
 * - `schemaRegistry`: collects reusable component schemas (errors, pagination, etc.)
 *   so they're referenced by `$ref` instead of being inlined on each response.
 *
 * Each module contributes to these during module load via:
 *   - `routeRegistry.push({...})` for routes
 *   - `schemaRegistry.register("Name", schema)` for reusable schemas
 */

import type { ZodType } from "zod";
import type { ZodOpenApiPathItemObject } from "zod-openapi";

// ─── Route Registry ─────────────────────────────────────────
export interface RouteDefinition {
  path: string;
  pathItem: ZodOpenApiPathItemObject;
}

export const routeRegistry: RouteDefinition[] = [];

// ─── Schema Registry ────────────────────────────────────────
const schemas = new Map<string, ZodType>();

export const schemaRegistry = {
  register(name: string, schema: ZodType): void {
    if (schemas.has(name)) {
      throw new Error(`Schema "${name}" is already registered`);
    }
    schemas.set(name, schema);
  },

  getAll(): Record<string, ZodType> {
    return Object.fromEntries(schemas);
  },
};
