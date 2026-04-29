import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*.eval.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
