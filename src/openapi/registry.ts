import type { ZodType } from "zod";
import type { ZodOpenApiPathItemObject } from "zod-openapi";

export interface RouteDefinition {
  path: string;
  pathItem: ZodOpenApiPathItemObject;
}

export const routeRegistry: RouteDefinition[] = [];

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
