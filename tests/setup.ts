import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { MongoClient } from "mongodb";
import { cookieJar, revalidated, afterQueue, router, nav, RedirectError, NotFoundError } from "./mocks/state";

/* ------------------------------ environment ------------------------------- */
// Set BEFORE any application module is imported (setup files run first).
const uri = process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27017";
const dbName = `taskflow_test_${process.pid}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "taskflow-test-"));

Object.assign(process.env, {
  MONGODB_URI: uri,
  MONGODB_DB: dbName,
  DATA_DIR: dataDir,
  SESSION_SECRET: "test-session-secret",
  SEED_DEMO_DATA: "false",
  ADMIN_EMAIL: "seed-admin@test.dev",
  ADMIN_PASSWORD: "seed-admin-pass",
  ADMIN_NAME: "Seed Admin",
  APP_URL: "http://localhost:3000",
  COOKIE_SECURE: "false",
});
for (const k of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_SECURE", "ALLOW_FILE_UPLOADS", "MAIL_FROM"]) delete process.env[k];

/* --------------------------------- mocks ---------------------------------- */

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
    set: (name: string, value: string) => void cookieJar.set(name, value),
    delete: (name: string) => void cookieJar.delete(name),
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectError(url);
  },
  notFound: () => {
    throw new NotFoundError();
  },
  useRouter: () => router,
  usePathname: () => nav.pathname,
}));

vi.mock("next/cache", () => ({ revalidatePath: (p: string) => void revalidated.push(p) }));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (fn: () => unknown) => void afterQueue.push(fn),
}));

// `cache` only exists in React's server build; outside Next it is a plain pass-through.
vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T,>(fn: T) => fn }));


/* ----------------------- jsdom gaps used by the editor ---------------------- */
// ProseMirror measures ranges/elements while moving the selection; jsdom has no layout, so return zeros.
if (typeof window !== "undefined" && typeof Range !== "undefined") {
  const rect = () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}) }) as DOMRect;
  Range.prototype.getBoundingClientRect = rect;
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
  document.elementFromPoint = () => null;
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
}

/* -------------------------------- cleanup --------------------------------- */

afterAll(async () => {
  const g = globalThis as unknown as { __tfClient?: Promise<MongoClient> };
  if (g.__tfClient) {
    try { (await g.__tfClient).close(); } catch {}
    g.__tfClient = undefined;
  }
  const c = new MongoClient(uri, { serverSelectionTimeoutMS: 3000 });
  try {
    await c.connect();
    await c.db(process.env.MONGODB_DB!).dropDatabase();
  } catch {
    /* nothing was created */
  } finally {
    await c.close();
  }
  fs.rmSync(process.env.DATA_DIR!, { recursive: true, force: true });
});
