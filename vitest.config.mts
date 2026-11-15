import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    globals: true, // lets Testing Library auto-clean up between tests
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts", "tests/components/**/*.test.tsx"],
    globalSetup: ["tests/global-setup.ts"],
    setupFiles: ["tests/setup.ts"],
    pool: "forks", // each test file gets its own process => its own throwaway database
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
