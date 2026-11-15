import { expect, test } from "@playwright/test";
import { createTicket, detail, login, logout, outboxSubjects } from "./helpers";

/**
 * Email rules (outbox mode: SMTP is unset in e2e, so every email is recorded for the admin to read):
 *   assigned to X               -> X
 *   someone else updates        -> the assignee, with what was posted
 *   the assignee updates        -> the reporter, with what was posted
 *   never mail yourself; sprint moves are silent
 */
test.describe.serial("email notifications", () => {
  let key = "";
  const title = "E2E mail ticket";

  test("assigning a ticket to someone emails the assignee", async ({ page }) => {
    await login(page, "admin");
    key = await createTicket(page, { board: "Website Team (WEB)", title, assignee: "Priya Sharma" });
    const subjects = await outboxSubjects(page);
    expect(subjects).toContain(`[${key}] Admin assigned you: ${title}`);
    const mail = page.locator("details.mail", { hasText: `[${key}] Admin assigned you` });
    await expect(mail).toContainText("to Priya Sharma <priya@taskflow.dev>");
    await expect(mail.locator("summary .lozenge")).toHaveText("logged");
  });

  test("the email body is a readable message with a link back to the ticket", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/admin/mail");
    await page.locator("details.mail", { hasText: `[${key}] Admin assigned you` }).locator("summary").click();
    const body = page.frameLocator("details.mail[open] iframe");
    await expect(body.getByText("A ticket was assigned to you")).toBeVisible();
    await expect(body.getByRole("link", { name: key, exact: true })).toHaveAttribute("href", `http://localhost:3200/browse/${key}`);
  });

  test("a comment by someone other than the assignee emails the assignee with the comment", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`/browse/${key}`);
    await page.getByPlaceholder("Add a comment…").fill("Priya, please prioritise <b>this</b> today");
    await page.getByRole("button", { name: "Comment", exact: true }).click();
    await expect(page.locator(".feed-item", { hasText: "please prioritise" })).toBeVisible();

    const subjects = await outboxSubjects(page);
    expect(subjects).toContain(`[${key}] Admin commented`);
    const mail = page.locator("details.mail", { hasText: `[${key}] Admin commented` });
    await expect(mail).toContainText("to Priya Sharma");
    await mail.locator("summary").click();
    const body = page.frameLocator("details.mail[open] iframe");
    await expect(body.getByText("Priya, please prioritise <b>this</b> today")).toBeVisible(); // shown literally: HTML is escaped
  });

  test("when the assignee posts a progress update, the reporter is emailed what was posted", async ({ page }) => {
    await login(page, "priya");
    await page.goto(`/browse/${key}`);
    await page.getByPlaceholder(/What did you get done/).fill("Started the investigation");
    await page.locator('input[type="range"]').fill("35");
    await page.getByPlaceholder("0", { exact: true }).fill("1.5");
    await page.getByRole("button", { name: "Post update" }).click();
    await expect(page.getByText("Progress update posted.")).toBeVisible();
    await logout(page);

    await login(page, "admin");
    const subjects = await outboxSubjects(page);
    expect(subjects).toContain(`[${key}] Priya Sharma posted a progress update (35% complete, 1.5h logged)`);
    const mail = page.locator("details.mail", { hasText: `Priya Sharma posted a progress update (35% complete, 1.5h logged)` });
    await expect(mail).toContainText("to Admin <admin@taskflow.dev>");
    await mail.locator("summary").click();
    await expect(page.frameLocator("details.mail[open] iframe").getByText("Started the investigation")).toBeVisible();
  });

  test("when the assignee changes something (status), the reporter is emailed", async ({ page }) => {
    await login(page, "priya");
    await page.goto(`/browse/${key}`);
    await detail(page, "Status").selectOption("in_review");
    await expect(detail(page, "Status")).toHaveValue("in_review");
    await logout(page);
    await login(page, "admin");
    expect(await outboxSubjects(page)).toContain(`[${key}] Priya Sharma changed Status from in_progress to in_review`);
  });

  test("a change by the reporter notifies the assignee (priority, description, attachments)", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`/browse/${key}`);
    await detail(page, "Priority").selectOption("highest");
    await expect(detail(page, "Priority")).toHaveValue("highest");
    await page.getByLabel("Link URL").fill("https://example.com/spec.png");
    await page.getByLabel("Link name").fill("Spec");
    await page.getByRole("button", { name: /Attach link/ }).click();
    await expect(page.locator(".att", { hasText: "Spec" })).toBeVisible();
    const subjects = await outboxSubjects(page);
    expect(subjects).toContain(`[${key}] Admin changed Priority from medium to highest`);
    expect(subjects).toContain(`[${key}] Admin attached Spec`);
  });

  test("no emails for your own actions, assigning yourself, or sprint planning", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`/browse/${key}`);
    const before = (await outboxSubjects(page)).length;
    await page.goto(`/browse/${key}`);
    await page.getByRole("button", { name: "Assign to me" }).click(); // admin -> admin: no mail
    await expect(page.locator(".assigned-strip")).toContainText("Admin");
    await detail(page, "Sprint").selectOption({ label: "Backlog (no sprint)" }); // sprint planning is silent
    await expect(detail(page, "Sprint")).toHaveValue("");
    await page.getByPlaceholder("Add a comment…").fill("note to self");
    await page.getByRole("button", { name: "Comment", exact: true }).click(); // admin is now reporter AND assignee
    await expect(page.locator(".feed-item", { hasText: "note to self" })).toBeVisible();
    expect((await outboxSubjects(page)).length).toBe(before);
  });

  test("the mail outbox is admin-only and explains it is in outbox mode", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/admin/mail");
    await expect(page.getByText(/No SMTP server configured/)).toBeVisible();
    await logout(page);
    await login(page, "priya");
    await page.goto("/admin/mail");
    await expect(page).toHaveURL("/");
  });
});
