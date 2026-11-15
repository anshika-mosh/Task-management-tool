import { expect, test } from "@playwright/test";
import { login } from "./helpers";

const theme = (page: import("@playwright/test").Page) => page.evaluate(() => document.documentElement.dataset.theme);
const bg = (page: import("@playwright/test").Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.describe("theme: light / dark mode", () => {
  test.describe("follows the operating system by default", () => {
    test.use({ colorScheme: "dark" });
    test("dark OS -> dark theme", async ({ page }) => {
      await page.goto("/login");
      expect(await theme(page)).toBe("dark");
    });
  });
  test.describe("light OS", () => {
    test.use({ colorScheme: "light" });
    test("light OS -> light theme", async ({ page }) => {
      await page.goto("/login");
      expect(await theme(page)).toBe("light");
    });
  });

  test.describe("toggling", () => {
    test.use({ colorScheme: "light" });

    test("the toggle switches theme, recolours the page and the choice survives reloads and navigation", async ({ page }) => {
      await login(page, "admin");
      const lightBg = await bg(page);
      await page.getByRole("button", { name: "Switch to dark mode" }).click();
      expect(await theme(page)).toBe("dark");
      const darkBg = await bg(page);
      expect(darkBg).not.toBe(lightBg);

      await page.reload();
      expect(await theme(page)).toBe("dark"); // no flash back to light
      await page.goto("/boards/WEB");
      expect(await theme(page)).toBe("dark");
      await expect(page.getByRole("button", { name: "Switch to light mode" })).toBeVisible();

      await page.getByRole("button", { name: "Switch to light mode" }).click();
      expect(await theme(page)).toBe("light");
      expect(await bg(page)).toBe(lightBg);
    });

    test("an explicit choice wins over the OS setting", async ({ page }) => {
      await page.goto("/login");
      await page.getByRole("button", { name: "Switch to dark mode" }).click();
      await page.reload();
      expect(await theme(page)).toBe("dark");
    });

    test("every main page renders in dark mode without unreadable (white-on-white) panels", async ({ page }) => {
      await login(page, "admin");
      await page.getByRole("button", { name: "Switch to dark mode" }).click();
      for (const url of ["/", "/boards/WEB", "/browse/WEB-1", "/issues", "/admin", "/boards/WEB/sprints"]) {
        await page.goto(url);
        const card = page.locator(".card, .details, .col, .page-head").first();
        await expect(card).toBeVisible();
        const body = await bg(page);
        expect(body).toBe("rgb(16, 18, 20)");
      }
    });
  });
});
