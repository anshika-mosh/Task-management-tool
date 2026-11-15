import { expect, test } from "./fixtures";
import { login, logout, USERS } from "./helpers";

test.describe("authentication & access control", () => {
  test("anonymous visitors are sent to the login page from every private page", async ({ page }) => {
    for (const url of ["/", "/boards/WEB", "/browse/WEB-1", "/issues", "/admin", "/admin/mail"]) {
      await page.goto(url);
      await expect(page).toHaveURL(/\/login$/);
    }
  });

  test("the login page explains the demo accounts", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("admin@taskflow.dev")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  test("wrong credentials show an error and keep you on the login page", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(USERS.admin.email);
    await page.getByLabel("Password").fill("definitely-wrong");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Invalid email or password.")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel("Email").fill("nobody@nowhere.dev");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Invalid email or password.")).toBeVisible();
  });

  test("regression: a failed login keeps the email you typed", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(USERS.admin.email);
    await page.getByLabel("Password").fill("wrong");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Invalid email or password.")).toBeVisible();
    await expect(page.getByLabel("Email")).toHaveValue(USERS.admin.email);
    // fix the password and sign in without retyping the email
    await page.getByLabel("Password").fill(USERS.admin.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/");
  });

  test("signing in lands on the home dashboard and the session survives a reload", async ({ page }) => {
    await login(page, "admin");
    await expect(page.getByRole("heading", { name: /Welcome back, Admin/ })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: /Welcome back, Admin/ })).toBeVisible();
    await page.goto("/login");
    await expect(page).toHaveURL("/"); // already signed in
  });

  test("logging out ends the session", async ({ page }) => {
    await login(page, "priya");
    await logout(page);
    await page.goto("/boards/WEB");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("members cannot reach the admin area and don't see its link", async ({ page }) => {
    await login(page, "priya");
    await expect(page.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);
    for (const url of ["/admin", "/admin/mail"]) {
      await page.goto(url);
      await expect(page).toHaveURL("/");
    }
  });

  test("admins see the Admin link", async ({ page }) => {
    await login(page, "admin");
    await expect(page.getByRole("link", { name: "Admin", exact: true })).toBeVisible();
  });

  test("a forged session cookie is rejected", async ({ page, context }) => {
    await context.addCookies([{ name: "tf_session", value: "1.9999999999999.forgedsignature", url: "http://localhost:3200" }]);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("private APIs refuse anonymous requests", async ({ request }) => {
    expect((await request.get("/api/ticket-id?key=WEB-1")).status()).toBe(401);
    expect((await request.get("/api/files/1")).status()).toBe(401);
    expect((await request.post("/api/tickets/1/attachments")).status()).toBe(401);
  });
});
