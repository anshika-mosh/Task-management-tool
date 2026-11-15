import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { confirmModal, createTicket, detail, login } from "./helpers";

// Sprints are exercised on the MOB board so the WEB board's demo sprint stays untouched for other specs.
const sprintCard = (page: Page, name: string) => page.locator(".sprint-card").filter({ has: page.getByRole("heading", { name, exact: true }) });

test.describe.serial("sprints & backlog", () => {
  test("the sprint page lists the demo sprint and the backlog", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/boards/MOB/sprints");
    const active = sprintCard(page, "MOB Sprint 1");
    await expect(active).toContainText("active");
    await expect(active).toContainText("🎯 Ship the first milestone.");
    await expect(page.locator(".sprint-card").filter({ has: page.getByRole("heading", { name: "Backlog" }) })).toBeVisible();
  });

  test("create a sprint with dates and a goal; it starts as planned", async ({ page }) => {
    await login(page, "priya"); // any signed-in member can plan sprints
    await page.goto("/boards/MOB/sprints");
    await page.getByRole("button", { name: "+ Create sprint" }).click();
    await expect(page.locator('input[name="name"]')).toHaveValue(/^MOB Sprint \d+$/);
    await page.locator('input[name="name"]').fill("E2E Sprint Two");
    await page.locator('input[name="start"]').fill("2030-01-01");
    await page.locator('input[name="end"]').fill("2030-01-14");
    await page.locator('input[name="goal"]').fill("Polish everything");
    await page.getByRole("button", { name: "Create sprint", exact: true }).click();
    const card = sprintCard(page, "E2E Sprint Two");
    await expect(card).toContainText("planned");
    await expect(card).toContainText("2030-01-01 → 2030-01-14");
    await expect(card).toContainText("Polish everything");
  });

  test("validation: the end date cannot be before the start date", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/boards/MOB/sprints");
    await page.getByRole("button", { name: "+ Create sprint" }).click();
    await page.locator('input[name="name"]').fill("Bad dates");
    await page.locator('input[name="start"]').fill("2030-02-10");
    await page.locator('input[name="end"]').fill("2030-02-01");
    await page.getByRole("button", { name: "Create sprint", exact: true }).click();
    await expect(page.getByText("End date must be after the start date.")).toBeVisible();
    await expect(sprintCard(page, "Bad dates")).toHaveCount(0);
  });

  test("only one sprint can be active per board", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/boards/MOB/sprints");
    await sprintCard(page, "E2E Sprint Two").getByRole("button", { name: "Start sprint" }).click();
    await expect(sprintCard(page, "E2E Sprint Two")).toContainText(/"MOB Sprint 1" is already active/);
    await expect(sprintCard(page, "E2E Sprint Two")).toContainText("planned");
  });

  test("move tickets between the backlog and a sprint", async ({ page }) => {
    await login(page, "admin");
    const key = await createTicket(page, { board: "Mobile App (MOB)", title: "E2E sprint mover" });
    await page.goto("/boards/MOB/sprints");
    const row = page.locator("tr", { hasText: "E2E sprint mover" });
    await row.getByLabel(`Sprint for ${key}`).selectOption({ label: "E2E Sprint Two" });
    await expect(sprintCard(page, "E2E Sprint Two").locator("tr", { hasText: "E2E sprint mover" })).toBeVisible();
    await page.getByRole("main").getByRole("link", { name: "← Back to board" }).click();
    await page.goto(`/browse/${key}`);
    await expect(detail(page, "Sprint")).toHaveValue(/\d+/);
    await expect(page.locator(".assigned-strip")).toContainText("E2E Sprint Two");
  });

  test("complete the active sprint: unfinished tickets roll into the next sprint, done ones stay", async ({ page }) => {
    await login(page, "admin");
    // Make sure the active sprint holds one finished and one unfinished ticket.
    await page.goto("/boards/MOB");
    const done = await createTicket(page, { board: "Mobile App (MOB)", title: "E2E finished work" });
    await detail(page, "Status").selectOption("done");
    await expect(detail(page, "Status")).toHaveValue("done");
    void done;

    await page.goto("/boards/MOB/sprints");
    const active = sprintCard(page, "MOB Sprint 1");
    await active.getByRole("button", { name: "Complete sprint" }).click();
    await expect(active.locator(".hint")).toContainText("unfinished ticket");
    await active.locator(".hint select").selectOption({ label: "E2E Sprint Two" });
    await active.locator(".hint").getByRole("button", { name: "Complete" }).click();

    await expect(sprintCard(page, "MOB Sprint 1")).toContainText("completed");
    // unfinished MOB tickets from the demo data moved to Sprint Two; the finished one stayed behind
    await expect(sprintCard(page, "E2E Sprint Two").locator("tr", { hasText: "Biometric login" })).toBeVisible();
    await expect(sprintCard(page, "MOB Sprint 1").locator("tr", { hasText: "E2E finished work" })).toBeVisible();
    // a completed sprint is read-only
    await expect(sprintCard(page, "MOB Sprint 1").locator("select")).toHaveCount(0);
  });

  test("start the next sprint: the board now shows it by default, completed sprints stay reachable", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/boards/MOB/sprints");
    await sprintCard(page, "E2E Sprint Two").getByRole("button", { name: "Start sprint" }).click();
    await expect(sprintCard(page, "E2E Sprint Two")).toContainText("active");

    await page.goto("/boards/MOB");
    await expect(page.locator(".sprint-banner")).toContainText("E2E Sprint Two");
    await expect(page.locator(".tcard", { hasText: "Biometric login" })).toBeVisible();
    await expect(page.locator(".tcard", { hasText: "E2E finished work" })).toHaveCount(0);

    await page.getByLabel("Completed sprints").selectOption({ label: "MOB Sprint 1" });
    await expect(page).toHaveURL(/sprint=\d+/);
    await expect(page.locator(".sprint-banner")).toContainText("completed");
    await expect(page.locator(".tcard", { hasText: "E2E finished work" })).toBeVisible();
  });

  test("the home dashboard shows the new active sprint", async ({ page }) => {
    await login(page, "admin");
    await expect(page.locator("a.board-card", { hasText: "Mobile App" })).toContainText("E2E Sprint Two");
  });

  test("the active sprint cannot be deleted; a planned one can (its tickets return to the backlog)", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/boards/MOB/sprints");
    await expect(sprintCard(page, "E2E Sprint Two").getByRole("button", { name: "Delete" })).toHaveCount(0);

    await page.getByRole("button", { name: "+ Create sprint" }).click();
    await page.locator('input[name="name"]').fill("E2E Disposable");
    await page.getByRole("button", { name: "Create sprint", exact: true }).click();
    await expect(sprintCard(page, "E2E Disposable")).toBeVisible();
    await sprintCard(page, "E2E Disposable").getByRole("button", { name: "Delete" }).click();
    await confirmModal(page, true);
    await expect(sprintCard(page, "E2E Disposable")).toHaveCount(0);
  });
});
