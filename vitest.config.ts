// vitest.config.ts
// ─────────────────────────────────────────────────────────────
// This is the configuration file for Vitest (our test framework).
// Vitest reads this file automatically when you run `npx vitest`.
// ─────────────────────────────────────────────────────────────

// `defineConfig` is a helper function from Vitest that gives us
// TypeScript autocompletion and validates the config shape.
import { defineConfig } from "vitest/config";

// `path` is a Node.js built-in module for handling file paths.
// We need it to resolve the `@` alias (maps to `./src`).
import path from "path";

// `defineConfig` accepts an object with a `test` property.
// This object controls how Vitest behaves.
export default defineConfig({
  test: {
    // `globals: true` makes Vitest functions available globally.
    // This means we can use `describe`, `it`, `expect`, `vi`
    // WITHOUT importing them in every test file.
    // Without this, we'd need: import { describe, it, expect } from "vitest"
    globals: true,

    // `environment: "node"` tells Vitest to run tests in a Node.js
    // environment (as opposed to "jsdom" for browser-like tests).
    // Since this is a backend API, we use "node".
    environment: "node",

    // `include` tells Vitest which files to treat as test files.
    // The pattern `"tests/**/*.test.ts"` means:
    //   - `tests/` — look in the `tests/` directory
    //   - `**/` — in any subdirectory (recursive)
    //   - `*.test.ts` — files ending with `.test.ts`
    // So `tests/restaurant/restaurant.service.unit.test.ts` matches.
    include: ["tests/**/*.test.ts"],

    // `coverage` configures code coverage reporting.
    // Coverage tells us what percentage of our code is executed by tests.
    coverage: {
      // `provider: "v8"` uses V8's built-in coverage engine.
      // It's fast and doesn't require instrumenting source code.
      provider: "v8",

      // `include` limits coverage to only the restaurant module.
      // Without this, coverage would include ALL source files.
      include: ["src/modules/restaurant/**/*.ts"],
    },
  },

  // `resolve` configures how module paths are resolved.
  resolve: {
    // `alias` creates shortcuts for import paths.
    // Our project uses `@/` in imports (e.g., `import { AppError } from "@/middlewares/error.middleware"`).
    // This maps `@` to the absolute path of `./src` so TypeScript and Vitest
    // can resolve `@/something` to `./src/something`.
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
