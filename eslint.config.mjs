import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
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

  prettier,
  {
    files: ["public/demo/*.js"],
    languageOptions: {
      globals: {
        self: "readonly",

        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        fetch: "readonly",
        atob: "readonly",
        Notification: "readonly",
      },
    },
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",

      "@typescript-eslint/no-namespace": ["error", { allowDeclarations: true }],

      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
