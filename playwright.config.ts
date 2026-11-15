import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests: build + start the real app on its own port with an isolated, throwaway
 * database (never your real one, never .env.local values) and drive it in a real browser.
 *
 *   npm run test:e2e            (builds first)
 *   E2E_SKIP_BUILD=1 npm run test:e2e   (reuse the previous .next-e2e build)
 *   PW_CHANNEL=msedge npm run test:e2e  (use Edge instead of Chrome)
 */
export const E2E_PORT = 3200;
export const E2E_DB = "taskflow_test_e2e";
export const E2E_URI = process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27017";
if (/mongodb\+srv|\.mongodb\.net/.test(E2E_URI) && process.env.ALLOW_REMOTE_TEST_DB !== "true") {
  throw new Error("Refusing to run end-to-end tests against a hosted MongoDB.");
}

const start = process.env.E2E_SKIP_BUILD ? `npx next start -p ${E2E_PORT}` : `npx next build && npx next start -p ${E2E_PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  fullyParallel: false,
  workers: 1, // one shared app + database: keep tests ordered and deterministic
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    channel: process.env.PW_CHANNEL || "chrome", // your installed browser: nothing is downloaded
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  outputDir: "./test-results",
  webServer: {
    command: start,
    port: E2E_PORT,
    timeout: 300_000,
    reuseExistingServer: false,
    stdout: "ignore",
    stderr: "pipe",
    // Explicit values always win over .env.local, so the app can only ever see the test database.
    env: {
      NEXT_DIST_DIR: ".next-e2e",
      MONGODB_URI: E2E_URI,
      MONGODB_DB: E2E_DB,
      SEED_DEMO_DATA: "true",
      ADMIN_EMAIL: "",
      ADMIN_PASSWORD: "",
      SESSION_SECRET: "e2e-session-secret",
      COOKIE_SECURE: "false",
      ALLOW_FILE_UPLOADS: "false",
      SMTP_HOST: "",
      SMTP_USER: "",
      SMTP_PASS: "",
      APP_URL: `http://localhost:${E2E_PORT}`,
      DATA_DIR: path.join(os.tmpdir(), "taskflow-e2e-data"),
    },
  },
});
