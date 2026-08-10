import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    // Build output, deps, generated Prisma client and logs are not linted.
    // `scripts/` and `perf/*.js` are plain CommonJS Node tooling run directly
    // by npm scripts, not application source — they legitimately use
    // `require`, `__dirname` and `process`, none of which this config's
    // browser-neutral globals allow. `perf/seed-load.ts` is NOT excluded: it
    // imports from `src/` and is held to the same standard as the app.
    ignores: [
      "dist/**",
      "node_modules/**",
      "src/generated/**",
      "logs/**",
      "scripts/**",
      "perf/*.js",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Disables stylistic rules that conflict with Prettier (must come last).
  prettier,
  {
    // The push demo's service worker runs in a worker global scope, where
    // `self` is the registration itself. Linted rather than ignored — it is
    // real code a browser executes, and a typo in it fails silently in the
    // background where nobody is watching.
    files: ["public/push-demo/sw.js"],
    languageOptions: {
      globals: { self: "readonly" },
    },
  },
  {
    rules: {
      // `any` is discouraged but allowed at typed boundaries (flagged, not fatal).
      "@typescript-eslint/no-explicit-any": "warn",
      // Allow `declare global { namespace Express { ... } }` module augmentation.
      "@typescript-eslint/no-namespace": ["error", { allowDeclarations: true }],
      // Allow intentionally-unused names prefixed with `_` (e.g. middleware next).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
