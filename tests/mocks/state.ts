/** Shared, inspectable state behind the Next.js mocks (see tests/setup.ts). */
import { vi } from "vitest";

export const cookieJar = new Map<string, string>();
export const revalidated: string[] = [];
/** Jobs scheduled with next/server's after(): run lazily, like Next does once the response has been sent. */
export const afterQueue: (() => unknown)[] = [];
export const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() };
export const nav = { pathname: "/" };

export class RedirectError extends Error {
  constructor(public url: string) {
    super(`NEXT_REDIRECT:${url}`);
  }
}
export class NotFoundError extends Error {
  constructor() {
    super("NEXT_NOT_FOUND");
  }
}

/** Await everything scheduled with next/server's `after()` (e.g. outgoing emails). */
export async function flushAfter() {
  while (afterQueue.length) await afterQueue.shift()!();
}
