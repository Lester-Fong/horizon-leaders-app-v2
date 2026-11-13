import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
      },
    },
  },
  {
    // Test fakes must never ship in application code.
    files: ["src/**/*.ts"],
    ignores: ["src/**/*.test.ts", "src/test-support/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/test-support/**"],
              message: "test-support is for tests only.",
            },
          ],
        },
      ],
    },
  },
);
