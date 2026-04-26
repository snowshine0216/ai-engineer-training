import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    env: { NODE_NO_WARNINGS: "1" },
    include: ["tests/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "**/tests/e2e/**",
      "**/.claude/**",
      "**/.claire/**",
    ],
  },
});
