import { test as base, expect } from "@playwright/test";

/**
 * Every e2e test uses this `test`. It watches for native browser dialogs and fails the test if the
 * app ever shows one: confirmations and prompts must be in-app modals.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    const nativeDialogs: string[] = [];
    page.on("dialog", async (d) => {
      nativeDialogs.push(`${d.type()}: ${d.message()}`);
      await d.dismiss().catch(() => {});
    });
    await use(page);
    expect(nativeDialogs, "the app must never use native browser dialogs (alert / confirm / prompt)").toEqual([]);
  },
});

export { expect };
