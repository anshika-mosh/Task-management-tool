import { expect, test } from "./fixtures";
import { attachViaPaperclip, confirmModal, createTicket, DRIVE_URL, editDescription, editorBox, login, toolbarBtn } from "./helpers";

/**
 * Images & videos are Google Drive links, added ONLY with the paperclip icon in the editor toolbar
 * (there is no separate "attach link" form any more).
 */
test.describe.serial("attachments: the paperclip icon in the editor", () => {
  let key = "";
  const desc = (page: import("@playwright/test").Page) => page.locator(".rte").first();

  test("a ticket has no link form and no file drop zone; the editor has the paperclip", async ({ page }) => {
    await login(page, "admin");
    key = await createTicket(page, { board: "Website Team (WEB)", title: "E2E attachments" });
    await expect(page.getByLabel("Link URL")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Attach link/ })).toHaveCount(0);
    await expect(page.locator(".dropzone")).toHaveCount(0);
    await editDescription(page);
    await expect(toolbarBtn(desc(page), "Attach image, video or file")).toBeVisible();
    await expect(page.locator("h3", { hasText: /^Attachments/ })).toHaveCount(0); // nothing attached yet
  });

  test("paperclip -> dialog explains Drive sharing; a Drive link lands in the text AND the attachments gallery", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`/browse/${key}`);
    await editDescription(page);
    await toolbarBtn(desc(page), "Attach image, video or file").click();
    const dialog = page.getByRole("dialog", { name: "Attach image, video or file" });
    await expect(dialog).toContainText("Anyone with the link");
    await dialog.getByLabel("Link", { exact: true }).fill(DRIVE_URL);
    await dialog.getByLabel("Name (optional)").fill("Pricing mockup.png");
    await dialog.getByRole("button", { name: "Attach", exact: true }).click();

    // in the text
    await expect(desc(page).locator("a.media-link", { hasText: "Pricing mockup.png" })).toBeVisible();
    // in the gallery (registered as a ticket attachment as soon as it was attached)
    const card = page.locator(".att", { hasText: "Pricing mockup.png" });
    await expect(card).toBeVisible();
    await expect(card).toContainText("Google Drive");
    await expect(card.locator("img")).toHaveAttribute("src", /drive\.google\.com\/thumbnail\?id=1AbCdEfGhIjKlMnOpQrStUvWxYz12345/);
    await expect(card.locator("a.name")).toHaveAttribute("href", DRIVE_URL);
    await expect(page.locator("h3", { hasText: "Attachments (1)" })).toBeVisible();

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.locator(".desc a.media-link", { hasText: "Pricing mockup.png" })).toBeVisible();
  });

  test("clicking the media chip in the text, or the thumbnail, opens the Drive viewer; Escape / click closes it", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`/browse/${key}`);
    const viewer = page.locator(".lightbox iframe");

    await page.locator(".desc a.media-link").click();
    await expect(viewer).toHaveAttribute("src", "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz12345/preview");
    await expect(page.getByRole("link", { name: "Open in Drive ↗" })).toHaveAttribute("href", DRIVE_URL);
    await expect(page).toHaveURL(new RegExp(`/browse/${key}$`)); // the page did not navigate away
    await page.keyboard.press("Escape");
    await expect(page.locator(".lightbox")).toHaveCount(0);

    await page.getByRole("button", { name: "Open Pricing mockup.png" }).click();
    await expect(viewer).toBeVisible();
    await page.locator(".lightbox .close").click();
    await expect(page.locator(".lightbox")).toHaveCount(0);
  });

  test("direct images, videos and ordinary links are supported too", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`/browse/${key}`);
    await editDescription(page);
    await attachViaPaperclip(page, desc(page), "https://example.com/photo.png", "Photo");
    await attachViaPaperclip(page, desc(page), "https://example.com/demo.mp4", "Demo clip");
    await attachViaPaperclip(page, desc(page), "https://www.loom.com/share/abc123", "");
    await expect(page.locator("h3", { hasText: "Attachments (4)" })).toBeVisible();
    await expect(page.locator(".att", { hasText: "www.loom.com" })).toContainText("Link");
    await expect(desc(page).locator('img[src="https://example.com/photo.png"]')).toBeVisible(); // images are embedded in the text
    await expect(desc(page).locator('a[data-media="video"]', { hasText: "Demo clip" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
  });

  test("invalid links are refused inside the dialog", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`/browse/${key}`);
    await editDescription(page);
    await toolbarBtn(desc(page), "Attach image, video or file").click();
    const dialog = page.getByRole("dialog", { name: "Attach image, video or file" });
    for (const bad of ["javascript:alert(1)", "just some words"]) {
      await dialog.getByLabel("Link", { exact: true }).fill(bad);
      await dialog.getByRole("button", { name: "Attach", exact: true }).click();
      await expect(dialog.getByRole("alert")).toHaveText("Enter a full link starting with https://");
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
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

  test("files can also be attached while creating a ticket (paperclip in the create dialog)", async ({ page }) => {
    await login(page, "admin");
    const k = await createTicket(page, { board: "Website Team (WEB)", title: "E2E created with media", link: { url: DRIVE_URL, name: "Recording.mp4" } });
    expect(k).toMatch(/^WEB-/);
    await expect(page.locator(".att", { hasText: "Recording.mp4" })).toBeVisible();
    await expect(page.locator("h3", { hasText: "Attachments (1)" })).toBeVisible();
    await expect(page.locator(".desc a.media-link", { hasText: "Recording.mp4" })).toBeVisible(); // and it is in the description text
  });

  test("a file that was deleted from the text before creating is not attached", async ({ page }) => {
    await login(page, "admin");
    await page.getByRole("button", { name: "+ Create" }).click();
    const dialog = page.getByRole("dialog", { name: "Create ticket" });
    await dialog.locator("select").first().selectOption({ label: "Website Team (WEB)" });
    await dialog.locator('input[name="title"]').fill("E2E removed media");
    await attachViaPaperclip(page, dialog, DRIVE_URL, "Oops.png");
    await editorBox(page, "Description").press("Control+A");
    await editorBox(page, "Description").press("Delete");
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page).toHaveURL(/\/browse\/WEB-\d+$/);
    await expect(page.locator(".att")).toHaveCount(0);
  });

  test("only the uploader or an admin can remove an attachment; removal asks in a modal", async ({ page }) => {
    await login(page, "priya");
    await page.goto(`/browse/${key}`);
    await expect(page.locator(".att").first().locator(".x")).toHaveCount(0); // added by admin
    await editDescription(page);
    await attachViaPaperclip(page, desc(page), "https://example.com/priya.png", "Priya's pic");
    await page.getByRole("button", { name: "Cancel" }).click();
    const mine = page.locator(".att", { hasText: "Priya's pic" });
    await expect(mine.locator(".x")).toHaveCount(1);
    await mine.hover();
    await mine.locator(".x").click();
    await expect(page.getByRole("alertdialog")).toContainText("Priya's pic");
    await confirmModal(page, true);
    await expect(mine).toHaveCount(0);
  });

  test("an admin can remove any attachment; cancelling the modal keeps it", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`/browse/${key}`);
    const target = page.locator(".att", { hasText: "Photo" });
    await target.hover();
    await target.locator(".x").click();
    await confirmModal(page, false);
    await expect(target).toHaveCount(1);
    await target.locator(".x").click();
    await confirmModal(page, true);
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
