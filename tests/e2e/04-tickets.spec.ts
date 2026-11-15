import { expect, test } from "./fixtures";
import { confirmModal, createTicket, detail, detailRow, editDescription, editorBox, login, logout } from "./helpers";

test.describe.serial("ticket lifecycle (Jira-style)", () => {
  let key = "";

  test("create a ticket with every field: it gets a unique BOARD-number key", async ({ page }) => {
    await login(page, "admin");
    key = await createTicket(page, {
      board: "Website Team (WEB)", title: "E2E full ticket", description: "Steps to reproduce", type: "bug", priority: "highest", assignee: "Priya Sharma",
    });
    expect(key).toMatch(/^WEB-\d+$/);
    await expect(page.getByLabel("Ticket summary")).toHaveValue("E2E full ticket");
    await expect(page.locator(".desc")).toContainText("Steps to reproduce");
    await expect(page.locator(".assigned-strip")).toContainText("Priya Sharma");
    await expect(detail(page, "Status")).toHaveValue("todo");
    await expect(detail(page, "Priority")).toHaveValue("highest");
    await expect(detail(page, "Type")).toHaveValue("bug");
    await expect(detail(page, "Sprint")).not.toHaveValue(""); // defaults to the active sprint
    await expect(detailRow(page, "Reporter")).toContainText("Admin");
  });

  test("numbers keep counting per board, independently", async ({ page }) => {
    await login(page, "admin");
    const n = Number(key.split("-")[1]);
    const second = await createTicket(page, { board: "Website Team (WEB)", title: "E2E second" });
    expect(second).toBe(`WEB-${n + 1}`);
    const other = await createTicket(page, { board: "Mobile App (MOB)", title: "E2E mobile one" });
    expect(other).toMatch(/^MOB-\d+$/);
    const third = await createTicket(page, { board: "Website Team (WEB)", title: "E2E third" });
    expect(third).toBe(`WEB-${n + 2}`);
  });

  test("edit the summary and description in place", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`/browse/${key}`);
    const title = page.getByLabel("Ticket summary");
    await title.fill("E2E renamed ticket");
    await title.press("Enter");
    await editDescription(page);
    await editorBox(page, "Description").fill("A brand new description");
    await page.getByRole("button", { name: "Save" }).click();
    await page.reload();
    await expect(page.getByLabel("Ticket summary")).toHaveValue("E2E renamed ticket");
    await expect(page.locator(".desc")).toHaveText("A brand new description");
  });

  test("change status, priority, type and due date from the details panel", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`/browse/${key}`);
    await detail(page, "Status").selectOption("in_review");
    await expect(page.getByRole("tab", { name: /^History \((\d+)\)/ })).toBeVisible();
    await detail(page, "Priority").selectOption("low");
    await detail(page, "Type").selectOption("story");
    await detail(page, "Due date").fill("2030-05-17");
    await page.waitForLoadState("networkidle"); // let the queued saves finish before reloading
    await page.reload();
    await expect(detail(page, "Status")).toHaveValue("in_review");
    await expect(detail(page, "Priority")).toHaveValue("low");
    await expect(detail(page, "Type")).toHaveValue("story");
    await expect(detail(page, "Due date")).toHaveValue("2030-05-17");
  });

  test("every change is recorded in the History tab", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`/browse/${key}`);
    await page.getByRole("tab", { name: /^History/ }).click();
    const history = page.locator(".activity-item");
    await expect(history.filter({ hasText: "created this ticket" })).toHaveCount(1);
    await expect(history.filter({ hasText: "changed Status from todo to in_review" })).toHaveCount(1);
    await expect(history.filter({ hasText: "changed Priority from highest to low" })).toHaveCount(1);
    await expect(history.filter({ hasText: "updated the description" })).toHaveCount(1);
  });

  test("assign to someone else, then 'Assign to me'", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`/browse/${key}`);
    await detail(page, "Assigned to").selectOption({ label: "Alex Morgan" });
    await expect(page.locator(".assigned-strip")).toContainText("Alex Morgan");
    await page.getByRole("button", { name: "Assign to me" }).click();
    await expect(page.locator(".assigned-strip")).toContainText("Admin");
    await expect(page.getByRole("button", { name: "Assign to me" })).toHaveCount(0);
    await detail(page, "Assigned to").selectOption({ label: "Unassigned" });
    await expect(page.locator(".assigned-strip")).toContainText("Unassigned");
  });

  test("comments appear in the activity feed", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`/browse/${key}`);
    await editorBox(page, "Comment").fill("First comment from e2e");
    await page.getByRole("button", { name: "Comment", exact: true }).click();
    await expect(page.locator(".feed-item", { hasText: "First comment from e2e" })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Updates & comments \(1\)/ })).toBeVisible();
    await expect(editorBox(page, "Comment")).toHaveText(""); // editor is cleared
  });

  test("a progress update records %, hours and moves a To Do ticket to In Progress", async ({ page }) => {
    await login(page, "admin");
    const fresh = await createTicket(page, { board: "Website Team (WEB)", title: "E2E progress ticket" });
    await expect(detail(page, "Status")).toHaveValue("todo");
    await editorBox(page, "Progress update").fill("Wrote the first half");
    await page.locator('input[type="range"]').fill("60");
    await page.getByPlaceholder("0", { exact: true }).fill("2.5");
    await page.getByRole("button", { name: "Post update" }).click();
    await expect(page.getByText("Progress update posted.")).toBeVisible();
    await page.reload();
    await expect(detailRow(page, "Progress")).toContainText("60%");
    await expect(detailRow(page, "Time logged")).toContainText("2.5h");
    await expect(detail(page, "Status")).toHaveValue("in_progress");
    await page.getByRole("tab", { name: /^Progress \(1\)/ }).click();
    const note = page.locator(".feed-item", { hasText: "Wrote the first half" });
    await expect(note).toContainText("60% complete");
    await expect(note).toContainText("2.5h logged");
    await page.goto(`/boards/WEB?sprint=all`);
    await expect(page.locator(".tcard", { hasText: "E2E progress ticket" }).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "60");
    void fresh;
  });

  test("find tickets with the search box (by key and by words)", async ({ page }) => {
    await login(page, "admin");
    await page.getByLabel("Search tickets").fill(key);
    await page.getByLabel("Search tickets").press("Enter");
    await expect(page).toHaveURL(/\/issues\?q=/);
    await expect(page.locator("table tbody tr")).toHaveCount(1);
    await expect(page.locator("table")).toContainText("E2E renamed ticket");
    await page.getByLabel("Search tickets").fill("e2e");
    await page.getByLabel("Search tickets").press("Enter");
    await expect(page).toHaveURL(/q=e2e/);
    await expect.poll(() => page.locator("table tbody tr").count()).toBeGreaterThan(3);
    await page.getByLabel("Search tickets").fill("zzzz-nothing");
    await page.getByLabel("Search tickets").press("Enter");
    await expect(page.getByText("No tickets match.")).toBeVisible();
  });

  test("the All tickets page filters by board, status, assignee…", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/issues");
    await page.locator('select[name="board"]').selectOption("MOB");
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(page).toHaveURL(/board=MOB/);
    const keys = await page.locator("table tbody tr td:nth-child(2)").allTextContents();
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) expect(k).toMatch(/^MOB-/);

    await page.getByRole("link", { name: "Reset" }).click();
    await expect(page).toHaveURL(/\/issues$/);
    await expect(page.locator('select[name="board"]')).toHaveValue(""); // regression: Reset must clear the dropdowns too
    await expect(page.locator('select[name="status"]')).toHaveValue("");
    await page.locator('select[name="status"]').selectOption("done");
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(page).toHaveURL(/status=done/);
    await expect(page.locator("table tbody tr").first()).toContainText("Done", { ignoreCase: true });
    for (const status of await page.locator("table tbody tr td:nth-child(5)").allTextContents()) expect(status.toLowerCase()).toBe("done");
  });

  test("only the reporter or an admin can delete a ticket", async ({ page }) => {
    await login(page, "priya");
    await page.goto(`/browse/${key}`);
    await expect(page.locator(".details-head").getByRole("button", { name: "Delete" })).toHaveCount(0);
    await logout(page);
    await login(page, "admin");
    await page.goto(`/browse/${key}`);
    await expect(page.locator(".details-head").getByRole("button", { name: "Delete" })).toBeVisible();
  });

  test("deleting a ticket asks for confirmation, then removes it", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`/browse/${key}`);
    await page.locator(".details-head").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("alertdialog")).toContainText(`Delete ${key}?`);
    await confirmModal(page, false);
    await expect(page).toHaveURL(new RegExp(`/browse/${key}$`)); // cancelled: still here
    await page.locator(".details-head").getByRole("button", { name: "Delete" }).click();
    await confirmModal(page, true);
    await expect(page).toHaveURL(/\/boards\/WEB/);
    const res = await page.goto(`/browse/${key}`);
    expect(res?.status()).toBe(404);
  });

  test("unknown tickets and boards show a 404", async ({ page }) => {
    await login(page, "admin");
    expect((await page.goto("/browse/NOPE-1"))?.status()).toBe(404);
    expect((await page.goto("/browse/garbage"))?.status()).toBe(404);
    expect((await page.goto("/boards/NOPE"))?.status()).toBe(404);
  });
});
