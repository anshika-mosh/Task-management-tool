// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nav, router } from "../mocks/state";
import type { Board, User } from "@/lib/types";

const actions = vi.hoisted(() => ({ login: vi.fn(), logout: vi.fn(), createTicket: vi.fn() }));
vi.mock("@/lib/actions", () => actions);
vi.mock("@/components/uploader", () => ({ uploadFiles: vi.fn() }));

import ThemeToggle from "@/components/ThemeToggle";
import LoginForm from "@/app/(auth)/login/LoginForm";
import Navbar from "@/components/Navbar";

beforeEach(() => {
  vi.clearAllMocks();
  document.documentElement.removeAttribute("data-theme");
  localStorage.clear();
  nav.pathname = "/";
});

describe("ThemeToggle (light / dark mode)", () => {
  it("starts from the theme chosen before first paint and offers the opposite", async () => {
    document.documentElement.dataset.theme = "dark";
    render(<ThemeToggle />);
    const btn = await screen.findByRole("button", { name: "Switch to light mode" });
    expect(btn.querySelector("svg")).toBeInTheDocument(); // sun icon
  });

  it("toggles dark -> light -> dark, updating <html data-theme> and remembering the choice", async () => {
    document.documentElement.dataset.theme = "light";
    render(<ThemeToggle />);
    const btn = await screen.findByRole("button", { name: "Switch to dark mode" });
    fireEvent.click(btn);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("tf-theme")).toBe("dark");
    expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("tf-theme")).toBe("light");
  });

  it("still switches when localStorage is unavailable", async () => {
    document.documentElement.dataset.theme = "light";
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    render(<ThemeToggle />);
    fireEvent.click(await screen.findByRole("button", { name: "Switch to dark mode" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    vi.restoreAllMocks();
  });

  it("can float (used on the login page)", async () => {
    render(<ThemeToggle floating />);
    expect(await screen.findByRole("button")).toHaveClass("theme-float");
  });
});

describe("LoginForm", () => {
  it("regression: keeps the typed email and password after a failed login (React must not reset the form)", async () => {
    actions.login.mockResolvedValue({ error: "Invalid email or password." });
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "me@x.dev" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "oops" } });
    fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);
    await screen.findByText("Invalid email or password.");
    expect(screen.getByLabelText("Email")).toHaveValue("me@x.dev");
    expect(screen.getByLabelText("Password")).toHaveValue("oops");
  });

  it("renders email and password fields", () => {
    render(<LoginForm />);
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("submits the credentials and shows the error from the server", async () => {
    actions.login.mockResolvedValue({ error: "Invalid email or password." });
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.dev" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "nope" } });
    fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);
    expect(await screen.findByText("Invalid email or password.")).toBeInTheDocument();
    const fd = actions.login.mock.calls[0][1] as FormData;
    expect([fd.get("email"), fd.get("password")]).toEqual(["a@b.dev", "nope"]);
  });
});

const user = (role: "admin" | "member"): User => ({ id: 1, name: "Ada Lovelace", email: "ada@x.dev", role, color: "#6554c0", created_at: "" });
const boards: Board[] = [
  { id: 1, key: "WEB", name: "Website", description: "", color: "#2684ff", counter: 0, created_at: "" },
  { id: 2, key: "MOB", name: "Mobile", description: "", color: "#36b37e", counter: 0, created_at: "" },
];
const renderNav = (over: Partial<React.ComponentProps<typeof Navbar>> = {}) =>
  render(<Navbar user={user("member")} boards={boards} users={[user("member")]} sprints={[]} allowUploads={false} {...over} />);

describe("Navbar", () => {
  it("shows the main navigation; the Admin link is for admins only", () => {
    const { unmount } = renderNav();
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "All tickets" })).toHaveAttribute("href", "/issues");
    expect(screen.queryByRole("link", { name: "Admin" })).not.toBeInTheDocument();
    unmount();
    renderNav({ user: user("admin") });
    expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin");
  });

  it("highlights the current section", () => {
    nav.pathname = "/issues";
    renderNav();
    expect(screen.getByRole("link", { name: "All tickets" })).toHaveClass("active");
    expect(screen.getByRole("link", { name: "Home" })).not.toHaveClass("active");
  });

  it("lists every board in the Boards menu", () => {
    renderNav();
    fireEvent.click(screen.getByRole("button", { name: "Boards ▾" }));
    expect(screen.getByRole("link", { name: /Website/ })).toHaveAttribute("href", "/boards/WEB");
    expect(screen.getByRole("link", { name: /Mobile/ })).toHaveAttribute("href", "/boards/MOB");
  });

  it("says so when there are no boards, and disables Create", () => {
    renderNav({ boards: [] });
    fireEvent.click(screen.getByRole("button", { name: "Boards ▾" }));
    expect(screen.getByText("No boards yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Create" })).toBeDisabled();
  });

  it("opens the create-ticket dialog with the current board preselected", () => {
    nav.pathname = "/boards/MOB";
    renderNav();
    fireEvent.click(screen.getByRole("button", { name: "+ Create" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getAllByRole("combobox")[0]).toHaveValue("2");
  });

  it("searches tickets by navigating to /issues?q=…", () => {
    renderNav();
    const box = screen.getByLabelText("Search tickets");
    fireEvent.change(box, { target: { value: "WEB-3 & more" } });
    fireEvent.submit(box.closest("form")!);
    expect(router.push).toHaveBeenCalledWith("/issues?q=WEB-3%20%26%20more");
  });

  it("regression: clicking Log out must not unmount its form before the browser submits it", () => {
    renderNav();
    fireEvent.click(screen.getByTitle("Ada Lovelace").closest("button")!);
    const logout = screen.getByRole("button", { name: "Log out" });
    fireEvent.click(logout);
    expect(logout.isConnected).toBe(true); // closing the menu here cancels the submit in real browsers
  });

  it("menus still close after choosing a link", () => {
    renderNav();
    fireEvent.click(screen.getByRole("button", { name: "Boards ▾" }));
    fireEvent.click(screen.getByRole("link", { name: /Website/ }));
    expect(screen.queryByRole("link", { name: /Website/ })).not.toBeInTheDocument();
  });

  it("has a theme toggle and a user menu with log out", async () => {
    renderNav();
    expect(await screen.findByRole("button", { name: /Switch to (dark|light) mode/ })).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Ada Lovelace").closest("button")!);
    expect(screen.getByText("ada@x.dev · member")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    await waitFor(() => expect(actions.logout).toHaveBeenCalled());
  });
});
