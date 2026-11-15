import type { Page } from "@playwright/test";
import { expect } from "./fixtures";

/** Demo accounts created by the first-run seed. */
export const USERS = {
  admin: { email: "admin@taskflow.dev", password: "admin123", name: "Admin" },
  priya: { email: "priya@taskflow.dev", password: "password", name: "Priya Sharma" },
  alex: { email: "alex@taskflow.dev", password: "password", name: "Alex Morgan" },
} as const;

export async function login(page: Page, who: keyof typeof USERS = "admin") {
  await page.goto("/login");
  await page.getByLabel("Email").fill(USERS[who].email);
  await page.getByLabel("Password").fill(USERS[who].password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
}

export async function logout(page: Page) {
  await page.locator(".nav .menu").last().getByRole("button").click();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

/** The n-th Word-style editor currently on the page (description, comment, progress update…). */
export const editorBox = (page: Page, label: string) => page.getByRole("textbox", { name: label });
export const toolbarBtn = (scope: Page | import("@playwright/test").Locator, name: string) => scope.getByRole("button", { name, exact: true });

/** Use the editor's paperclip: opens the attach dialog, fills it and confirms. */
export async function attachViaPaperclip(page: Page, scope: Page | import("@playwright/test").Locator, url: string, name = "") {
  await toolbarBtn(scope, "Attach image, video or file").click();
  const dialog = page.getByRole("dialog", { name: "Attach image, video or file" });
  await dialog.getByLabel("Link", { exact: true }).fill(url);
  if (name) await dialog.getByLabel("Name (optional)").fill(name);
  await dialog.getByRole("button", { name: "Attach", exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

/** Answer the in-app confirmation modal (there are no native browser dialogs in this app). */
export async function confirmModal(page: Page, accept: boolean) {
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  if (accept) await dialog.locator(".modal-foot button").last().click();
  else await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
}

/** Open the global "+ Create" dialog and create a ticket; returns its key (e.g. WEB-6). */
export async function createTicket(
  page: Page,
  o: { board?: string; title: string; description?: string; assignee?: string; type?: string; priority?: string; link?: { url: string; name?: string } },
) {
  await page.getByRole("button", { name: "+ Create" }).click();
  const dialog = page.getByRole("dialog", { name: "Create ticket" });
  if (o.board) await dialog.locator("select").first().selectOption({ label: o.board });
  await dialog.locator('input[name="title"]').fill(o.title);
  if (o.description) await editorBox(page, "Description").fill(o.description);
  if (o.type) await dialog.locator('select[name="type"]').selectOption(o.type);
  if (o.priority) await dialog.locator('select[name="priority"]').selectOption(o.priority);
  if (o.assignee) await dialog.locator('select[name="assignee"]').selectOption({ label: o.assignee });
  if (o.link) await attachViaPaperclip(page, dialog, o.link.url, o.link.name);
  const before = page.url();
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  // Wait for the NEW ticket's page (we may already be standing on another ticket's URL).
  await page.waitForURL((u) => u.toString() !== before && /\/browse\/[A-Z0-9]+-\d+$/.test(u.pathname));
  return new URL(page.url()).pathname.split("/").pop()!;
}

/** Open a ticket's description in edit mode. */
export async function editDescription(page: Page) {
  await page.getByRole("button", { name: "Edit description" }).click();
  await expect(editorBox(page, "Description")).toBeVisible();
}

export const DRIVE_URL = "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz12345/view?usp=sharing";

/** Read the admin's mail outbox as a list of subjects (newest first). */
export async function outboxSubjects(page: Page) {
  await page.goto("/admin/mail");
  await expect(page.getByRole("heading", { name: "Mail outbox" })).toBeVisible();
  return page.locator("details.mail summary b").allTextContents();
}

/** The control for one row of a ticket's Details panel, e.g. detail(page, "Status") -> its <select>. */
export const detailRow = (page: Page, label: string) =>
  page.locator(".detail-row").filter({ has: page.locator(".lbl", { hasText: new RegExp(`^${label}$`) }) });
export const detail = (page: Page, label: string) => detailRow(page, label).locator("select, input");
