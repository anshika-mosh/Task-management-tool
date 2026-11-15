import { expect, test } from "@playwright/test";
import { createTicket, detail, detailRow, login } from "./helpers";

test.describe("home dashboard", () => {
  test("shows every board with status breakdown, active sprint and totals", async ({ page }) => {
    await login(page, "admin");
    for (const name of ["Website Team", "Mobile App", "Infrastructure"]) await expect(page.locator("a.board-card", { hasText: name })).toBeVisible();
    const web = page.locator("a.board-card", { hasText: "Website Team" });
    await expect(web).toContainText("WEB");
    await expect(web).toContainText("WEB Sprint 1");
    await expect(web).toContainText("In Progress");
    await expect(page.locator(".stat", { hasText: "Boards" }).locator("b")).toHaveText("3");
    await expect(page.locator(".stat", { hasText: "Total tickets" })).toBeVisible();
  });

  test("a board card opens the board", async ({ page }) => {
    await login(page, "admin");
    await page.locator("a.board-card", { hasText: "Mobile App" }).click();
    await expect(page).toHaveURL(/\/boards\/MOB/);
    await expect(page.getByRole("heading", { name: /Mobile App/ })).toBeVisible();
  });

  test("lists the tickets assigned to the signed-in user, and recent activity", async ({ page }) => {
    await login(page, "priya");
    const mine = page.locator("section", { hasText: "Assigned to you" });
    await expect(mine.getByRole("link", { name: /WEB-1.*pricing page/i })).toBeVisible();
    await expect(page.locator("section", { hasText: "Recent activity" }).locator(".activity-item").first()).toBeVisible();
    await mine.getByRole("link", { name: /WEB-1/ }).click();
    await expect(page).toHaveURL(/\/browse\/WEB-1$/);
  });

  test("a brand-new ticket shows up in the user's feed and counts", async ({ page }) => {
    await login(page, "admin");
    const key = await createTicket(page, { board: "Infrastructure (OPS)", title: "E2E home feed ticket", assignee: "Admin" });
    await page.goto("/");
    await expect(page.locator("section", { hasText: "Assigned to you" }).getByRole("link", { name: new RegExp(key) })).toBeVisible();
    await expect(page.locator("section", { hasText: "Recent activity" })).toContainText(key);
  });
});

test.describe("board view (Kanban)", () => {
  test("defaults to the active sprint with a banner, columns and cards", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/boards/WEB");
    await expect(page.locator(".sprint-banner")).toContainText("WEB Sprint 1");
    await expect(page.locator(".sprint-banner")).toContainText("active");
    for (const col of ["To Do", "In Progress", "In Review", "Done"]) await expect(page.locator(".col h3", { hasText: col })).toBeVisible();
    await expect(page.locator(".tcard", { hasText: "Redesign the pricing page" })).toBeVisible();
    // WEB-4 and WEB-5 are in the backlog, not in the sprint
    await expect(page.locator(".tcard", { hasText: "Migrate blog to MDX" })).toHaveCount(0);
  });

  test("sprint chips switch between sprint, backlog and all tickets", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/boards/WEB");
    const chips = page.getByRole("main");
    await chips.getByRole("link", { name: "Backlog", exact: true }).click();
    await expect(page).toHaveURL(/sprint=backlog/);
    await expect(page.locator(".tcard", { hasText: "Migrate blog to MDX" })).toBeVisible();
    await expect(page.locator(".tcard", { hasText: "Redesign the pricing page" })).toHaveCount(0);
    await chips.getByRole("link", { name: "All tickets", exact: true }).click();
    await expect(page.locator(".tcard", { hasText: "Migrate blog to MDX" })).toBeVisible();
    await expect(page.locator(".tcard", { hasText: "Redesign the pricing page" })).toBeVisible();
    await page.locator("a.chip", { hasText: "WEB Sprint 1" }).click();
    await expect(page.locator(".tcard", { hasText: "Migrate blog to MDX" })).toHaveCount(0);
  });

  test("filters: text search, assignee, type, priority, and clear", async ({ page }) => {
    await login(page, "priya");
    await page.goto("/boards/WEB?sprint=all");
    const cards = page.locator(".tcard");
    const total = await cards.count();
    await page.getByPlaceholder("Search this board…").fill("dark mode");
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText("WEB-3");
    await page.getByPlaceholder("Search this board…").fill("");
    await page.locator(".filters select").nth(0).selectOption("me");
    await expect(cards.filter({ hasText: "Redesign the pricing page" })).toHaveCount(1);
    await expect(cards.filter({ hasText: "Fix broken image" })).toHaveCount(0);
    await page.locator(".filters select").nth(1).selectOption("bug");
    await expect(cards).toHaveCount(0);
    await expect(page.getByText("No matches").first()).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(cards).toHaveCount(total);
  });

  test("drag and drop moves a card between columns and the change persists", async ({ page }) => {
    await login(page, "admin");
    const key = await createTicket(page, { board: "Website Team (WEB)", title: "E2E drag me" });
    await page.goto("/boards/WEB");
    const card = () => page.locator(".tcard", { hasText: "E2E drag me" });
    const column = (n: number) => page.locator(".col").nth(n);
    await expect(column(0).locator(".tcard", { hasText: "E2E drag me" })).toBeVisible(); // To Do

    await card().dragTo(column(1));
    await expect(column(1).locator(".tcard", { hasText: "E2E drag me" })).toBeVisible();
    await card().dragTo(column(3));
    await expect(column(3).locator(".tcard", { hasText: "E2E drag me" })).toBeVisible();

    await page.reload();
    await expect(page.locator(".col").nth(3).locator(".tcard", { hasText: "E2E drag me" })).toBeVisible();
    await page.goto(`/browse/${key}`);
    await expect(detail(page, "Status")).toHaveValue("done");
    await expect(detailRow(page, "Progress")).toContainText("100%");
  });
});
