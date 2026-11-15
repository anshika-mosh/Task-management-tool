import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { attachViaPaperclip, confirmModal, createTicket, DRIVE_URL, editDescription, editorBox, login, toolbarBtn } from "./helpers";

/**
 * The Word-style editor: descriptions, comments and progress updates all use it, with lists, code,
 * tables, quotes, checklists, links and attachments - and whatever is saved renders the same everywhere.
 */
const rte = (page: Page, label: string): Locator => page.locator(".rte").filter({ has: page.getByRole("textbox", { name: label }) });

test.describe.serial("rich text editor", () => {
  let key = "";

  test("description, comment and progress-update boxes all have the same full toolbar", async ({ page }) => {
    await login(page, "admin");
    key = await createTicket(page, { board: "Website Team (WEB)", title: "E2E rich text" });
    await editDescription(page);
    for (const label of ["Description", "Comment", "Progress update"]) {
      const bar = rte(page, label).getByRole("toolbar", { name: "Formatting" });
      await expect(bar).toBeVisible();
      for (const tool of [
        "Undo", "Redo", "Heading 1", "Heading 2", "Heading 3", "Bold", "Italic", "Underline", "Strikethrough", "Highlight", "Bullet list", "Numbered list",
        "Checklist", "Quote", "Code", "Code block", "Divider", "Align left", "Align center", "Align right", "Table", "Link", "Attach image, video or file", "Clear formatting",
      ]) await expect(toolbarBtn(bar, tool)).toBeVisible();
    }
  });

  test("build a document with toolbar buttons and keyboard, save, and see it rendered", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`/browse/${key}`);
    await editDescription(page);
    const box = rte(page, "Description");
    const editor = editorBox(page, "Description");

    await editor.click();
    await toolbarBtn(box, "Heading 2").click();
    await page.keyboard.type("Release plan");
    await page.keyboard.press("Enter"); // new paragraph (headings end on Enter)

    await toolbarBtn(box, "Bullet list").click();
    await page.keyboard.type("first bullet");
    await page.keyboard.press("Enter");
    await page.keyboard.type("second bullet");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter"); // leave the list

    await toolbarBtn(box, "Numbered list").click();
    await page.keyboard.type("step one");
    await page.keyboard.press("Enter");
    await page.keyboard.type("step two");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");

    await toolbarBtn(box, "Checklist").click();
    await page.keyboard.type("write docs");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");

    await toolbarBtn(box, "Quote").click();
    await page.keyboard.type("measure twice");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");

    await toolbarBtn(box, "Code block").click();
    await page.keyboard.type("npm run verify");
    await page.keyboard.press("ArrowDown");

    await toolbarBtn(box, "Divider").click();
    await toolbarBtn(box, "Table").click();

    await expect(editor.locator("h2")).toHaveText("Release plan");
    await expect(editor.locator("ul:not([data-type]) li")).toHaveCount(2);
    await expect(editor.locator("ol li")).toHaveCount(2);
    await expect(editor.locator('ul[data-type="taskList"] li')).toHaveCount(1);
    await expect(editor.locator("blockquote")).toContainText("measure twice");
    await expect(editor.locator("pre code")).toHaveText("npm run verify");
    await expect(editor.locator("hr")).toHaveCount(1);
    await expect(editor.locator("table th")).toHaveCount(3);

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("toolbar")).toHaveCount(2); // editor closed (comment + progress editors remain)

    // saved content survives a reload and renders as real formatting
    await page.reload();
    const shown = page.locator(".desc .rich");
    await expect(shown.locator("h2")).toHaveText("Release plan");
    await expect(shown.locator("ul:not([data-type]) li")).toHaveText(["first bullet", "second bullet"]);
    await expect(shown.locator("ol li")).toHaveText(["step one", "step two"]);
    await expect(shown.locator('ul[data-type="taskList"] input[type="checkbox"]')).toBeDisabled();
    await expect(shown.locator("blockquote")).toContainText("measure twice");
    await expect(shown.locator("pre code")).toHaveText("npm run verify");
    await expect(shown.locator("hr")).toHaveCount(1);
    await expect(shown.locator("table")).toHaveCount(1);
  });

  test("inline formatting and markdown-style shortcuts while typing", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`/browse/${key}`);
    await editDescription(page);
    const editor = editorBox(page, "Description");
    await editor.press("Control+A");
    await page.keyboard.press("Delete");

    await page.keyboard.press("Control+b");
    await page.keyboard.type("bold");
    await page.keyboard.press("Control+b");
    await page.keyboard.type(" and ");
    await page.keyboard.press("Control+i");
    await page.keyboard.type("italic");
    await page.keyboard.press("Control+i");
    await page.keyboard.press("Enter");
    await page.keyboard.type("- shortcut bullet"); // "- " becomes a bullet list
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.type("1. shortcut number"); // "1. " becomes a numbered list
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.type("## Heading shortcut");

    await expect(editor.locator("strong")).toHaveText("bold");
    await expect(editor.locator("em")).toHaveText("italic");
    await expect(editor.locator("ul li")).toHaveText("shortcut bullet");
    await expect(editor.locator("ol li")).toHaveText("shortcut number");
    await expect(editor.locator("h2")).toHaveText("Heading shortcut");
    await page.getByRole("button", { name: "Cancel" }).click();
  });

  test("Save is only available after a change, and Cancel throws edits away", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`/browse/${key}`);
    await editDescription(page);
    await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
    await editorBox(page, "Description").pressSequentially(" extra words");
    await expect(page.getByRole("button", { name: "Save" })).toBeEnabled();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.locator(".desc")).not.toContainText("extra words");
  });

  test("the Link tool opens a dialog (not a browser prompt) and creates a safe external link", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`/browse/${key}`);
    await editDescription(page);
    const box = rte(page, "Description");
    const editor = editorBox(page, "Description");
    await editor.press("Control+A");
    await page.keyboard.type("Read the docs");
    await editor.press("Control+A");
    await toolbarBtn(box, "Link").click();
    const dialog = page.getByRole("dialog", { name: "Insert link" });
    await dialog.getByLabel("Link", { exact: true }).fill("not a link");
    await dialog.getByRole("button", { name: "Insert" }).click();
    await expect(dialog.getByRole("alert")).toBeVisible();
    await dialog.getByLabel("Link", { exact: true }).fill("https://example.com/docs");
    await dialog.getByLabel("Link", { exact: true }).press("Enter");
    await expect(dialog).toHaveCount(0);
    await page.getByRole("button", { name: "Save" }).click();
    const link = page.locator(".desc a", { hasText: "Read the docs" });
    await expect(link).toHaveAttribute("href", "https://example.com/docs");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
  });

  test("code from users is shown as text, never executed (XSS-safe)", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`/browse/${key}`);
    await editDescription(page);
    const editor = editorBox(page, "Description");
    await editor.press("Control+A");
    await editor.pressSequentially('<img src=x onerror="window.__pwned=1"> <script>window.__pwned=2</script>');
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.locator(".desc")).toContainText('<img src=x onerror="window.__pwned=1">');
    await page.reload();
    await expect(page.locator(".desc")).toContainText("<script>window.__pwned=2</script>");
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    expect(await page.locator(".desc img, .desc script").count()).toBe(0);
  });

  test("comments are rich too: lists, bold and code appear formatted and the editor clears", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`/browse/${key}`);
    const box = rte(page, "Comment");
    const editor = editorBox(page, "Comment");
    await editor.click();
    await page.keyboard.press("Control+b");
    await page.keyboard.type("Heads up");
    await page.keyboard.press("Control+b");
    await page.keyboard.press("Enter");
    await toolbarBtn(box, "Bullet list").click();
    await page.keyboard.type("check the cache");
    await page.keyboard.press("Enter");
    await page.keyboard.type("restart the worker");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await toolbarBtn(box, "Code block").click();
    await page.keyboard.type("redis-cli flushall");
    await page.getByRole("button", { name: "Comment", exact: true }).click();

    const posted = page.locator(".feed-item", { hasText: "Heads up" });
    await expect(posted.locator("strong")).toHaveText("Heads up");
    await expect(posted.locator("ul li")).toHaveText(["check the cache", "restart the worker"]);
    await expect(posted.locator("pre code")).toHaveText("redis-cli flushall");
    await expect(editor).toHaveText(""); // editor is empty again
  });

  test("progress updates are rich too, and keep their % and hours", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`/browse/${key}`);
    const box = rte(page, "Progress update");
    await editorBox(page, "Progress update").click();
    await toolbarBtn(box, "Numbered list").click();
    await page.keyboard.type("migrated the schema");
    await page.keyboard.press("Enter");
    await page.keyboard.type("backfilled data");
    await page.locator('input[type="range"]').fill("70");
    await page.getByPlaceholder("0", { exact: true }).fill("3");
    await page.getByRole("button", { name: "Post update" }).click();
    await expect(page.getByText("Progress update posted.")).toBeVisible();

    await page.getByRole("tab", { name: /^Progress/ }).click();
    const note = page.locator(".feed-item", { hasText: "migrated the schema" });
    await expect(note.locator("ol li")).toHaveText(["migrated the schema", "backfilled data"]);
    await expect(note).toContainText("70% complete");
    await expect(note).toContainText("3h logged");
  });

  test("empty comments and progress updates are rejected with a message", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`/browse/${key}`);
    await page.getByRole("button", { name: "Comment", exact: true }).click();
    await expect(page.getByText("Write something first.")).toBeVisible();
    await editorBox(page, "Progress update").click();
    await page.keyboard.press("Space");
    await page.getByRole("button", { name: "Post update" }).click();
    await expect(page.getByText("Describe what you did.")).toBeVisible();
  });

  test("a Drive file attached inside a comment appears as a chip that opens the viewer", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`/browse/${key}`);
    const box = rte(page, "Comment");
    await editorBox(page, "Comment").click();
    await page.keyboard.type("Screen recording: ");
    await attachViaPaperclip(page, box, DRIVE_URL, "Recording.mp4");
    await page.getByRole("button", { name: "Comment", exact: true }).click();
    const chip = page.locator(".feed-item a.media-link", { hasText: "Recording.mp4" });
    await expect(chip).toBeVisible();
    await chip.click();
    await expect(page.locator(".lightbox iframe")).toHaveAttribute("src", /drive\.google\.com\/file\/d\/1AbCdEfGhIjKlMnOpQrStUvWxYz12345\/preview/);
    await page.keyboard.press("Escape");
    await expect(page.locator(".lightbox")).toHaveCount(0);
  });

  test("tables can grow (row / column tools) and be deleted", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`/browse/${key}`);
    await editDescription(page);
    const box = rte(page, "Description");
    const editor = editorBox(page, "Description");
    await toolbarBtn(box, "Table").click();
    await toolbarBtn(box, "Add row").click();
    await toolbarBtn(box, "Add column").click();
    await expect(editor.locator("table tr")).toHaveCount(4);
    await expect(editor.locator("table th")).toHaveCount(4);
    await toolbarBtn(box, "Delete table").click();
    await expect(editor.locator("table")).toHaveCount(0);
    await page.getByRole("button", { name: "Cancel" }).click();
  });

  test("the editor is usable in dark mode (readable toolbar and text area)", async ({ page }) => {
    await login(page, "admin");
    await page.getByRole("button", { name: "Switch to dark mode" }).click();
    await page.goto(`/browse/${key}`);
    const box = rte(page, "Comment");
    await expect(box).toBeVisible();
    const colors = await box.evaluate((el) => ({ surface: getComputedStyle(el).backgroundColor, text: getComputedStyle(el.querySelector(".rte-body")!).color }));
    expect(colors.surface).toBe("rgb(19, 25, 37)");
    expect(colors.text).not.toBe("rgb(15, 23, 42)"); // not the light theme's dark ink on a dark surface
  });
});

test.describe("in-app dialogs replace browser alerts", () => {
  test("deleting shows a modal that can be cancelled with the button, Escape or the backdrop", async ({ page }) => {
    await login(page, "admin");
    const key = await createTicket(page, { board: "Website Team (WEB)", title: "E2E modal ticket" });
    const del = page.locator(".details-head").getByRole("button", { name: "Delete" });

    await del.click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText(`Delete ${key}?`);
    await expect(dialog).toContainText(/cannot be undone/);
    await expect(dialog.getByRole("button", { name: "Delete ticket" })).toBeFocused(); // keyboard users can just press Enter
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    await del.click();
    await expect(dialog).toBeVisible();
    await page.mouse.click(5, 5); // backdrop
    await expect(dialog).toHaveCount(0);

    await del.click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/browse/${key}$`));

    await del.click();
    await confirmModal(page, true);
    await expect(page).toHaveURL(/\/boards\/WEB/);
  });

  test("the create-ticket dialog closes with Escape, and a nested link dialog only closes itself first", async ({ page }) => {
    await login(page, "admin");
    await page.getByRole("button", { name: "+ Create" }).click();
    const create = page.getByRole("dialog", { name: "Create ticket" });
    await expect(create).toBeVisible();
    await toolbarBtn(create, "Link").click();
    const link = page.getByRole("dialog", { name: "Insert link" });
    await expect(link).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(link).toHaveCount(0);
    await expect(create).toBeVisible(); // the outer dialog survived
    await page.keyboard.press("Escape");
    await expect(create).toHaveCount(0);
  });
});
