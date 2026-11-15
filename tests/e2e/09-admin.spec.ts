import { expect, test, type Page } from "@playwright/test";
import { createTicket, login, logout } from "./helpers";

const boardRow = (page: Page, name: string) => page.locator(".card.row", { hasText: name });

test.describe.serial("administration: boards", () => {
  test("the admin page lists boards and users", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/admin");
    await expect(boardRow(page, "Website Team")).toContainText("WEB");
    await expect(page.locator("table tbody tr", { hasText: "priya@taskflow.dev" })).toBeVisible();
  });

  test("create a board: the key is suggested from the name and tickets use it", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/admin");
    await page.getByPlaceholder("Website Team").fill("E2E Design Team");
    await expect(page.getByPlaceholder("WEB", { exact: true })).toHaveValue("EDT");
    await page.getByPlaceholder("What does this team work on?").fill("Design system");
    await page.getByRole("button", { name: "Create board" }).click();
    await expect(page.getByText("Board EDT created.")).toBeVisible();
    await expect(boardRow(page, "E2E Design Team")).toContainText("EDT");

    await page.goto("/");
    await expect(page.locator("a.board-card", { hasText: "E2E Design Team" })).toBeVisible();
    await page.getByRole("button", { name: "Boards ▾" }).click();
    await expect(page.locator(".menu-pop").getByRole("link", { name: /E2E Design Team/ })).toBeVisible();

    const key = await createTicket(page, { board: "E2E Design Team (EDT)", title: "First design ticket" });
    expect(key).toBe("EDT-1");
  });

  test("keys must be unique and well-formed", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/admin");
    const name = page.getByPlaceholder("Website Team");
    const key = page.getByPlaceholder("WEB", { exact: true });
    await name.fill("Duplicate");
    await key.fill("edt");
    await page.getByRole("button", { name: "Create board" }).click();
    await expect(page.getByText(/already used by another board/)).toBeVisible();
    await expect(name).toHaveValue("Duplicate"); // regression: errors must not wipe what you typed
    await expect(page.getByPlaceholder("What does this team work on?")).toHaveValue("");
    await key.fill("9bad");
    await page.getByRole("button", { name: "Create board" }).click();
    await expect(page.getByText(/Key must be 2–10 letters/)).toBeVisible();
    await key.fill("A");
    await page.getByRole("button", { name: "Create board" }).click();
    await expect(page.getByText(/Key must be 2–10 letters/)).toBeVisible();
  });

  test("edit a board's name; the key stays", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/admin");
    await boardRow(page, "E2E Design Team").getByRole("button", { name: "Edit" }).click();
    await expect(page.getByText(/can't be changed/)).toBeVisible();
    await page.getByRole("button", { name: "Save" }).locator("xpath=ancestor::form").locator('input[name="name"]').fill("E2E Design Guild");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(boardRow(page, "E2E Design Guild")).toContainText("EDT");
  });

  test("deleting a board removes its tickets (after confirming)", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/admin");
    page.once("dialog", (d) => {
      expect(d.message()).toContain("EDT");
      return d.dismiss();
    });
    await boardRow(page, "E2E Design Guild").getByRole("button", { name: "Delete" }).click();
    await expect(boardRow(page, "E2E Design Guild")).toHaveCount(1);
    page.once("dialog", (d) => d.accept());
    await boardRow(page, "E2E Design Guild").getByRole("button", { name: "Delete" }).click();
    await expect(boardRow(page, "E2E Design Guild")).toHaveCount(0);
    expect((await page.goto("/boards/EDT"))?.status()).toBe(404);
    expect((await page.goto("/browse/EDT-1"))?.status()).toBe(404);
  });
});

test.describe.serial("administration: users", () => {
  const person = { name: "Zed Tester", email: "zed@e2e.dev", password: "zed-pass-1" };

  test("add a team member who can then sign in (and sees no admin tools)", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/admin");
    const form = page.getByRole("button", { name: "Add user" }).locator("xpath=ancestor::form");
    await form.locator('input[name="name"]').fill(person.name);
    await form.locator('input[name="email"]').fill(person.email);
    await form.locator('input[name="password"]').fill(person.password);
    await page.getByRole("button", { name: "Add user" }).click();
    await expect(page.getByText("Zed Tester added.")).toBeVisible();
    await expect(page.locator("table tbody tr", { hasText: person.email })).toBeVisible();
    await logout(page);

    await page.goto("/login");
    await page.getByLabel("Email").fill(person.email);
    await page.getByLabel("Password").fill(person.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: /Welcome back, Zed/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);
  });

  test("duplicate emails and weak passwords are refused", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/admin");
    const form = page.getByRole("button", { name: "Add user" }).locator("xpath=ancestor::form");
    await form.locator('input[name="name"]').fill("Dupe");
    await form.locator('input[name="email"]').fill(person.email.toUpperCase());
    await form.locator('input[name="password"]').fill("long-enough");
    await page.getByRole("button", { name: "Add user" }).click();
    await expect(page.getByText(/already registered/)).toBeVisible();
    await form.locator('input[name="password"]').fill("123");
    await page.getByRole("button", { name: "Add user" }).click();
    await expect(page.locator('input[name="password"]:invalid')).toHaveCount(1); // browser enforces min length
  });

  test("promote a user to admin, and demote again; you cannot change yourself", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/admin");
    const row = page.locator("table tbody tr", { hasText: person.email });
    await row.locator("select").selectOption("admin");
    await expect(row.locator("select")).toHaveValue("admin");
    await page.reload();
    await expect(page.locator("table tbody tr", { hasText: person.email }).locator("select")).toHaveValue("admin");
    await page.locator("table tbody tr", { hasText: person.email }).locator("select").selectOption("member");
    await expect(page.locator("table tbody tr", { hasText: "admin@taskflow.dev" }).locator("select")).toBeDisabled();
    await expect(page.locator("table tbody tr", { hasText: "admin@taskflow.dev" }).getByRole("button", { name: "Remove" })).toHaveCount(0);
  });

  test("removing a user blocks their login and unassigns their tickets", async ({ page }) => {
    await login(page, "admin");
    const key = await createTicket(page, { board: "Website Team (WEB)", title: "E2E zed's ticket", assignee: person.name });
    await page.goto("/admin");
    page.once("dialog", (d) => d.accept());
    await page.locator("table tbody tr", { hasText: person.email }).getByRole("button", { name: "Remove" }).click();
    await expect(page.locator("table tbody tr", { hasText: person.email })).toHaveCount(0);
    await page.goto(`/browse/${key}`);
    await expect(page.locator(".assigned-strip")).toContainText("Unassigned");
    await logout(page);

    await page.goto("/login");
    await page.getByLabel("Email").fill(person.email);
    await page.getByLabel("Password").fill(person.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Invalid email or password.")).toBeVisible();
  });
});
