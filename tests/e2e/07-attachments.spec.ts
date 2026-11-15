import { expect, test } from "@playwright/test";
import { createTicket, DRIVE_URL, login } from "./helpers";

test.describe.serial("images & videos as Google Drive links", () => {
  let key = "";

  test("a ticket offers a link form, and no file drop zone (local uploads are off)", async ({ page }) => {
    await login(page, "admin");
    key = await createTicket(page, { board: "Website Team (WEB)", title: "E2E attachments" });
    await expect(page.getByLabel("Link URL")).toBeVisible();
    await expect(page.getByText(/Anyone with the link/)).toBeVisible();
    await expect(page.locator(".dropzone")).toHaveCount(0);
    await expect(page.locator("h3", { hasText: "Attachments (0)" })).toBeVisible();
  });

  test("attach a Drive link: it shows a Drive thumbnail with the given name", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`/browse/${key}`);
    await page.getByLabel("Link URL").fill(DRIVE_URL);
    await page.getByLabel("Link name").fill("Pricing mockup.png");
    await page.getByRole("button", { name: /Attach link/ }).click();
    const card = page.locator(".att", { hasText: "Pricing mockup.png" });
    await expect(card).toBeVisible();
    await expect(card).toContainText("Google Drive");
    await expect(card.locator("img")).toHaveAttribute("src", /drive\.google\.com\/thumbnail\?id=1AbCdEfGhIjKlMnOpQrStUvWxYz12345/);
    await expect(card.locator("a.name")).toHaveAttribute("href", DRIVE_URL);
    await expect(card.locator("a.name")).toHaveAttribute("target", "_blank");
    await expect(page.locator("h3", { hasText: "Attachments (1)" })).toBeVisible();
    await expect(page.getByLabel("Link URL")).toHaveValue(""); // form resets
  });

  test("clicking the thumbnail opens the Drive viewer; Escape / click closes it", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`/browse/${key}`);
    await page.getByRole("button", { name: "Open Pricing mockup.png" }).click();
    const frame = page.locator(".lightbox iframe");
    await expect(frame).toHaveAttribute("src", "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz12345/preview");
    await expect(page.getByRole("link", { name: "Open in Drive ↗" })).toHaveAttribute("href", DRIVE_URL);
    await page.keyboard.press("Escape");
    await expect(page.locator(".lightbox")).toHaveCount(0);
    await page.getByRole("button", { name: "Open Pricing mockup.png" }).click();
    await page.locator(".lightbox .close").click();
    await expect(page.locator(".lightbox")).toHaveCount(0);
  });

  test("direct image and video URLs and ordinary links are supported too", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`/browse/${key}`);
    for (const [url, name] of [["https://example.com/photo.png", "Photo"], ["https://example.com/demo.mp4", "Demo clip"], ["https://www.loom.com/share/abc123", ""]] as const) {
      await page.getByLabel("Link URL").fill(url);
      await page.getByLabel("Link name").fill(name);
      await page.getByRole("button", { name: /Attach link/ }).click();
      await expect(page.locator(".att a.name", { hasText: name || "www.loom.com" })).toBeVisible();
    }
    await expect(page.locator("h3", { hasText: "Attachments (4)" })).toBeVisible();
    await expect(page.locator(".att", { hasText: "www.loom.com" })).toContainText("Link");
  });

  test("invalid links are refused", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`/browse/${key}`);
    await page.getByLabel("Link URL").fill("javascript:alert(1)");
    await page.getByRole("button", { name: /Attach link/ }).click();
    await expect(page.getByText("Paste a full link starting with https://")).toBeVisible();
    await expect(page.locator("h3", { hasText: "Attachments (4)" })).toBeVisible();
    // the browser itself blocks text that is not a URL
    await page.getByLabel("Link URL").fill("just some words");
    await page.getByRole("button", { name: /Attach link/ }).click();
    await expect(page.locator("h3", { hasText: "Attachments (4)" })).toBeVisible();
  });

  test("attachments appear in the history and as a count on the board card", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`/browse/${key}`);
    await page.getByRole("tab", { name: /^History/ }).click();
    await expect(page.locator(".activity-item", { hasText: "attached Pricing mockup.png" })).toBeVisible();
    await page.goto("/boards/WEB?sprint=all");
    await expect(page.locator(".tcard", { hasText: "E2E attachments" })).toContainText("📎 4");
  });

  test("links can also be added while creating a ticket", async ({ page }) => {
    await login(page, "admin");
    const k = await createTicket(page, { board: "Website Team (WEB)", title: "E2E created with media", link: { url: DRIVE_URL, name: "Recording.mp4" } });
    await expect(page.locator(".att", { hasText: "Recording.mp4" })).toBeVisible();
    await expect(page.locator("h3", { hasText: "Attachments (1)" })).toBeVisible();
    expect(k).toMatch(/^WEB-/);
  });

  test("only the uploader or an admin can remove an attachment", async ({ page }) => {
    await login(page, "priya");
    await page.goto(`/browse/${key}`);
    await expect(page.locator(".att").first().locator(".x")).toHaveCount(0); // added by admin
    await page.getByLabel("Link URL").fill("https://example.com/priya.png");
    await page.getByLabel("Link name").fill("Priya's pic");
    await page.getByRole("button", { name: /Attach link/ }).click();
    const mine = page.locator(".att", { hasText: "Priya's pic" });
    await expect(mine.locator(".x")).toHaveCount(1);
    page.once("dialog", (d) => d.accept());
    await mine.hover();
    await mine.locator(".x").click({ force: true });
    await expect(mine).toHaveCount(0);
  });

  test("an admin can remove any attachment (after confirming)", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`/browse/${key}`);
    const target = page.locator(".att", { hasText: "Photo" });
    page.once("dialog", (d) => d.dismiss());
    await target.hover();
    await target.locator(".x").click({ force: true });
    await expect(target).toHaveCount(1); // cancelled
    page.once("dialog", (d) => d.accept());
    await target.locator(".x").click({ force: true });
    await expect(target).toHaveCount(0);
    await page.getByRole("tab", { name: /^History/ }).click();
    await expect(page.locator(".activity-item", { hasText: "removed attachment Photo" })).toBeVisible();
  });

  test("server-side upload endpoint is closed while ALLOW_FILE_UPLOADS is off", async ({ page }) => {
    await login(page, "admin");
    const res = await page.request.post("/api/tickets/1/attachments", {
      multipart: { files: { name: "x.txt", mimeType: "text/plain", buffer: Buffer.from("hello") } },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).error).toMatch(/Drive link/);
  });
});
