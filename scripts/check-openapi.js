/**
 * Smoke-checks the generated OpenAPI document.
 *
 * Routes register themselves as an import side effect, so a module that fails
 * to load — or a schema `$ref` pointing at something never registered — only
 * shows up when the document is actually built. `tsc` cannot catch either.
 * Run against `dist/`, so it doubles as a check that the build output boots.
 *
 * Usage: npm run build && npm run verify:openapi
 */
const { buildOpenApiDocument } = require("../dist/openapi/document");

const document = buildOpenApiDocument();
const paths = Object.keys(document.paths ?? {});
const schemas = Object.keys(document.components?.schemas ?? {});

if (paths.length === 0) {
  console.error("OpenAPI document has no paths — route registration is broken");
  process.exit(1);
}

// Every $ref in the document must resolve to a registered component schema.
const missing = new Set();
const walk = (node) => {
  if (Array.isArray(node)) {
    node.forEach(walk);
    return;
  }
  if (!node || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node)) {
    if (key === "$ref" && typeof value === "string") {
      const name = value.replace("#/components/schemas/", "");
      if (!schemas.includes(name)) missing.add(name);
    } else {
      walk(value);
    }
  }
};
walk(document.paths);

if (missing.size > 0) {
  console.error(
    `OpenAPI document references unregistered schemas: ${[...missing].join(", ")}`,
  );
  process.exit(1);
}

console.log(
  `OpenAPI document OK — ${paths.length} paths, ${schemas.length} schemas`,
);
