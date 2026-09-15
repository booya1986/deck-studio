import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 60_000,
  },
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
});
