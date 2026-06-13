import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    // Build output, deps, generated Prisma client and logs are not linted.
    ignores: [
      "dist/**",
      "node_modules/**",
      "src/generated/**",
      "logs/**",
      "scripts/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Disables stylistic rules that conflict with Prettier (must come last).
  prettier,
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
