// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { router } from "../mocks/state";
import { answerConfirm, confirmDialog, renderWithConfirm } from "./utils";
import type { BoardStats, Sprint, User } from "@/lib/types";

const actions = vi.hoisted(() => ({
  completeSprint: vi.fn(), createSprint: vi.fn(), deleteSprint: vi.fn(), startSprint: vi.fn(), updateTicket: vi.fn(),
  createBoard: vi.fn(), createUser: vi.fn(), deleteBoard: vi.fn(), deleteUser: vi.fn(), setUserRole: vi.fn(), updateBoard: vi.fn(),
}));
vi.mock("@/lib/actions", () => actions);

import SprintPicker from "@/app/(app)/boards/[key]/SprintPicker";
import { CreateSprint, SprintCard } from "@/app/(app)/boards/[key]/sprints/SprintsClient";
import { BoardForms, UserForms, UserRow } from "@/app/(app)/admin/AdminClient";

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

/* ------------------------------- SprintPicker ------------------------------ */

describe("SprintPicker", () => {
  const sprints = [
    { id: 1, name: "WEB Sprint 1", status: "active" },
    { id: 2, name: "WEB Sprint 2", status: "planned" },
    { id: 3, name: "WEB Sprint 0", status: "completed" },
  ];

  it("shows open sprints, Backlog and All tickets as links; the active one is marked", () => {
    render(<SprintPicker boardKey="WEB" view="1" sprints={sprints} />);
    expect(screen.getByRole("link", { name: /WEB Sprint 1/ })).toHaveAttribute("href", "/boards/WEB?sprint=1");
    expect(screen.getByRole("link", { name: /WEB Sprint 1/ })).toHaveClass("active");
    expect(screen.getByRole("link", { name: "WEB Sprint 2" })).not.toHaveClass("active");
    expect(screen.getByRole("link", { name: "Backlog" })).toHaveAttribute("href", "/boards/WEB?sprint=backlog");
    expect(screen.getByRole("link", { name: "All tickets" })).toHaveAttribute("href", "/boards/WEB?sprint=all");
    expect(screen.queryByRole("link", { name: "WEB Sprint 0" })).not.toBeInTheDocument();
  });

  it("highlights Backlog / All when those views are selected", () => {
    const { unmount } = render(<SprintPicker boardKey="WEB" view="backlog" sprints={sprints} />);
    expect(screen.getByRole("link", { name: "Backlog" })).toHaveClass("active");
    unmount();
    render(<SprintPicker boardKey="WEB" view="all" sprints={sprints} />);
    expect(screen.getByRole("link", { name: "All tickets" })).toHaveClass("active");
  });

  it("completed sprints live in a dropdown that navigates", () => {
    render(<SprintPicker boardKey="WEB" view="1" sprints={sprints} />);
    fireEvent.change(screen.getByLabelText("Completed sprints"), { target: { value: "3" } });
    expect(router.push).toHaveBeenCalledWith("/boards/WEB?sprint=3");
  });

  it("has no dropdown when nothing is completed", () => {
    render(<SprintPicker boardKey="WEB" view="all" sprints={sprints.slice(0, 2)} />);
    expect(screen.queryByLabelText("Completed sprints")).not.toBeInTheDocument();
  });
});

/* --------------------------------- Sprints --------------------------------- */

const sprint = (over: Partial<Sprint> = {}): Sprint => ({
  id: 1, board_id: 1, name: "WEB Sprint 1", goal: "Ship it", start_date: "2026-01-01", end_date: "2026-01-14", status: "planned", completed_at: null, created_at: "", total: 3, done: 1, ...over,
});
const tk = (id: number, over = {}) => ({ id, key: `WEB-${id}`, title: `Task ${id}`, type: "task", status: "todo", priority: "medium", assignee_name: null, assignee_color: null, sprint_id: null as number | null, ...over });

describe("CreateSprint", () => {
  it("expands into a form prefilled with the next sprint name and creates the sprint", async () => {
    actions.createSprint.mockResolvedValue({ ok: "created" });
    render(<CreateSprint boardId={7} boardKey="WEB" nextNumber={3} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Create sprint" }));
    const name = document.querySelector("input[name=name]") as HTMLInputElement;
    expect(name.value).toBe("WEB Sprint 3");
    fireEvent.change(name, { target: { value: "Spring push" } });
    fireEvent.change(screen.getByPlaceholderText(/achieve/), { target: { value: "Launch" } });
    fireEvent.submit(name.closest("form")!);
    await waitFor(() => expect(actions.createSprint).toHaveBeenCalled());
    const [boardId, , fd] = actions.createSprint.mock.calls[0];
    expect([boardId, (fd as FormData).get("name"), (fd as FormData).get("goal")]).toEqual([7, "Spring push", "Launch"]);
    await waitFor(() => expect(screen.getByRole("button", { name: "+ Create sprint" })).toBeInTheDocument()); // closes on success
  });

  it("shows validation errors and can be cancelled", async () => {
    actions.createSprint.mockResolvedValue({ error: "End date must be after the start date." });
    render(<CreateSprint boardId={7} boardKey="WEB" nextNumber={1} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Create sprint" }));
    fireEvent.submit((document.querySelector("input[name=name]") as HTMLElement).closest("form")!);
    expect(await screen.findByText("End date must be after the start date.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "+ Create sprint" })).toBeInTheDocument();
  });
});

describe("SprintCard", () => {
  const open = [{ id: 1, name: "WEB Sprint 1" }, { id: 2, name: "WEB Sprint 2" }];

  it("a planned sprint can be started or deleted; shows dates, goal, progress", async () => {
    actions.startSprint.mockResolvedValue({});
    renderWithConfirm(<SprintCard sprint={sprint()} tickets={[tk(1)]} openSprints={open} plannedTargets={[]} />);
    expect(screen.getByRole("heading", { name: "WEB Sprint 1" })).toBeInTheDocument();
    expect(screen.getByText("planned")).toBeInTheDocument();
    expect(screen.getByText("2026-01-01 → 2026-01-14")).toBeInTheDocument();
    expect(screen.getByText("🎯 Ship it")).toBeInTheDocument();
    expect(screen.getByText("1/3 done")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Complete sprint" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start sprint" }));
    await waitFor(() => expect(actions.startSprint).toHaveBeenCalledWith(1));
  });

  it("shows the reason when starting is refused (one active sprint per board)", async () => {
    actions.startSprint.mockResolvedValue({ error: '"WEB Sprint 0" is already active. Complete it before starting another.' });
    renderWithConfirm(<SprintCard sprint={sprint()} tickets={[]} openSprints={open} plannedTargets={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Start sprint" }));
    expect(await screen.findByText(/already active/)).toBeInTheDocument();
  });

  it("an active sprint is completed through a confirmation that lets you pick where unfinished tickets go", async () => {
    actions.completeSprint.mockResolvedValue({});
    renderWithConfirm(<SprintCard sprint={sprint({ status: "active" })} tickets={[tk(1, { status: "done" }), tk(2), tk(3, { status: "in_review" })]} openSprints={open} plannedTargets={[{ id: 2, name: "WEB Sprint 2" }]} />);
    expect(screen.queryByRole("button", { name: "Start sprint" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument(); // cannot delete the active sprint
    fireEvent.click(screen.getByRole("button", { name: "Complete sprint" }));
    expect(screen.getByText(/2 unfinished tickets will move to/)).toBeInTheDocument();
    const hint = screen.getByText(/unfinished tickets will move to/).closest(".hint") as HTMLElement;
    fireEvent.change(within(hint).getByRole("combobox"), { target: { value: "2" } });
    fireEvent.click(within(hint).getByRole("button", { name: "Complete" }));
    await waitFor(() => expect(actions.completeSprint).toHaveBeenCalledWith(1, 2));
  });

  it("completing without choosing a target sends unfinished tickets to the backlog", async () => {
    actions.completeSprint.mockResolvedValue({});
    renderWithConfirm(<SprintCard sprint={sprint({ status: "active" })} tickets={[tk(1)]} openSprints={open} plannedTargets={[{ id: 2, name: "WEB Sprint 2" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Complete sprint" }));
    fireEvent.click(screen.getByRole("button", { name: "Complete" }));
    await waitFor(() => expect(actions.completeSprint).toHaveBeenCalledWith(1, null));
  });

  it("when everything is done there is nothing to move", () => {
    renderWithConfirm(<SprintCard sprint={sprint({ status: "active" })} tickets={[tk(1, { status: "done" })]} openSprints={open} plannedTargets={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Complete sprint" }));
    expect(screen.getByText(/All tickets are done/)).toBeInTheDocument();
  });

  it("a completed sprint is read-only: tickets cannot be moved, but the sprint can be deleted", async () => {
    actions.deleteSprint.mockResolvedValue({});
    renderWithConfirm(<SprintCard sprint={sprint({ status: "completed" })} tickets={[tk(1, { status: "done", sprint_id: 1 })]} openSprints={open} plannedTargets={[]} />);
    expect(screen.getByText("Completed", { selector: "span.muted" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Sprint for WEB-1")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete sprint" }));
    await waitFor(() => expect(actions.deleteSprint).toHaveBeenCalledWith(1));
  });

  it("deleting asks in a modal first (no browser dialog); cancelling keeps the sprint", async () => {
    const nativeConfirm = vi.spyOn(window, "confirm");
    renderWithConfirm(<SprintCard sprint={sprint()} tickets={[]} openSprints={open} plannedTargets={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await confirmDialog()).toHaveTextContent(/move back to the backlog/);
    await answerConfirm(false);
    expect(actions.deleteSprint).not.toHaveBeenCalled();
    expect(nativeConfirm).not.toHaveBeenCalled();
  });

  it("each ticket row links to the ticket and has a sprint selector (including Backlog)", () => {
    actions.updateTicket.mockResolvedValue(undefined);
    renderWithConfirm(<SprintCard sprint={sprint()} tickets={[tk(1, { sprint_id: 1, title: "Fix login" })]} openSprints={open} plannedTargets={[]} />);
    expect(screen.getByRole("link", { name: /WEB-1 Fix login/ })).toHaveAttribute("href", "/browse/WEB-1");
    const sel = screen.getByLabelText("Sprint for WEB-1") as HTMLSelectElement;
    expect(within(sel).getAllByRole("option").map((o) => o.textContent)).toEqual(["Backlog", "WEB Sprint 1", "WEB Sprint 2"]);
    expect(sel.value).toBe("1");
    fireEvent.change(sel, { target: { value: "2" } });
    expect(actions.updateTicket).toHaveBeenCalledWith(1, "sprint_id", "2");
    fireEvent.change(sel, { target: { value: "" } });
    expect(actions.updateTicket).toHaveBeenLastCalledWith(1, "sprint_id", null);
  });

  it("the backlog card has no sprint actions and explains when empty", () => {
    renderWithConfirm(<SprintCard backlog tickets={[]} openSprints={open} plannedTargets={[]} />);
    expect(screen.getByText("Backlog")).toBeInTheDocument();
    expect(screen.getByText("Backlog is empty.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

/* ---------------------------------- Admin ---------------------------------- */

const board = (over: Partial<BoardStats> = {}): BoardStats => ({
  id: 1, key: "WEB", name: "Website", description: "Marketing", color: "#2684ff", counter: 4, created_at: "", total: 4, todo: 1, in_progress: 1, in_review: 1, done: 1, avg_progress: 50, ...over,
});

describe("Admin: create board", () => {
  const nameBox = () => screen.getByPlaceholderText("Website Team") as HTMLInputElement;
  const keyBox = () => screen.getByPlaceholderText("WEB") as HTMLInputElement;

  it("suggests a key from the name: initials for several words, first letters for one", () => {
    renderWithConfirm(<BoardForms boards={[]} />);
    fireEvent.change(nameBox(), { target: { value: "Design Systems Team" } });
    expect(keyBox().value).toBe("DST");
    fireEvent.change(nameBox(), { target: { value: "Infrastructure" } });
    expect(keyBox().value).toBe("INFRA");
    fireEvent.change(nameBox(), { target: { value: "R&D / Labs!" } });
    expect(keyBox().value).toBe("RL"); // punctuation is dropped before taking initials
  });

  it("stops suggesting once the admin types their own key (uppercased)", () => {
    renderWithConfirm(<BoardForms boards={[]} />);
    fireEvent.change(keyBox(), { target: { value: "ops" } });
    expect(keyBox().value).toBe("OPS");
    fireEvent.change(nameBox(), { target: { value: "Something Else" } });
    expect(keyBox().value).toBe("OPS");
  });

  it("submits the form and shows success / error messages", async () => {
    actions.createBoard.mockResolvedValueOnce({ error: "The key WEB is already used by another board." }).mockResolvedValueOnce({ ok: "Board WEB created." });
    renderWithConfirm(<BoardForms boards={[]} />);
    fireEvent.change(nameBox(), { target: { value: "Web Team" } });
    fireEvent.submit(nameBox().closest("form")!);
    expect(await screen.findByText(/already used/)).toBeInTheDocument();
    const fd = actions.createBoard.mock.calls[0][1] as FormData;
    expect([fd.get("name"), fd.get("key")]).toEqual(["Web Team", "WT"]);
    fireEvent.submit(nameBox().closest("form")!);
    expect(await screen.findByText("Board WEB created.")).toBeInTheDocument();
    await waitFor(() => expect(keyBox().value).toBe("")); // form resets after success
  });
});

describe("forms keep what you typed when the server rejects them", () => {
  it("create board: a duplicate-key error does not clear the name or description", async () => {
    actions.createBoard.mockResolvedValue({ error: "The key WEB is already used by another board." });
    renderWithConfirm(<BoardForms boards={[]} />);
    fireEvent.change(screen.getByPlaceholderText("Website Team"), { target: { value: "Web Team" } });
    fireEvent.change(screen.getByPlaceholderText("What does this team work on?"), { target: { value: "Marketing" } });
    fireEvent.submit(screen.getByPlaceholderText("Website Team").closest("form")!);
    await screen.findByText(/already used/);
    expect(screen.getByPlaceholderText("Website Team")).toHaveValue("Web Team");
    expect(screen.getByPlaceholderText("What does this team work on?")).toHaveValue("Marketing");
  });
});

describe("Admin: board list", () => {
  it("lists boards with their key and ticket count, linking to the board", () => {
    renderWithConfirm(<BoardForms boards={[board(), board({ id: 2, key: "MOB", name: "Mobile", total: 1, description: "" })]} />);
    expect(screen.getByRole("link", { name: "Website" })).toHaveAttribute("href", "/boards/WEB");
    expect(screen.getByText(/4 tickets · Marketing/)).toBeInTheDocument();
    expect(screen.getByText(/^1 ticket$/)).toBeInTheDocument();
  });

  it("edits a board (key is not editable) and can cancel", async () => {
    actions.updateBoard.mockResolvedValue({ ok: "Saved." });
    renderWithConfirm(<BoardForms boards={[board()]} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByText(/can't be changed/)).toBeInTheDocument();
    const name = screen.getByDisplayValue("Website");
    fireEvent.change(name, { target: { value: "Web Platform" } });
    fireEvent.submit(name.closest("form")!);
    await waitFor(() => expect(actions.updateBoard).toHaveBeenCalled());
    expect(actions.updateBoard.mock.calls[0][0]).toBe(1);
    expect((actions.updateBoard.mock.calls[0][2] as FormData).get("name")).toBe("Web Platform");
    await waitFor(() => expect(screen.queryByText(/can't be changed/)).not.toBeInTheDocument()); // closes after save
  });

  it("deleting a board warns about its tickets and needs confirmation", async () => {
    const nativeConfirm = vi.spyOn(window, "confirm");
    renderWithConfirm(<BoardForms boards={[board()]} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await confirmDialog();
    expect(dialog).toHaveTextContent("Delete board WEB?");
    expect(dialog).toHaveTextContent(/4 tickets/);
    await answerConfirm(false);
    expect(actions.deleteBoard).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete board" }));
    await waitFor(() => expect(actions.deleteBoard).toHaveBeenCalledWith(1));
    expect(nativeConfirm).not.toHaveBeenCalled();
  });
});

describe("Admin: users", () => {
  const u = (over: Partial<User> = {}): User => ({ id: 2, name: "Bob Jones", email: "bob@x.dev", role: "member", color: "#222222", created_at: "", ...over });
  const inTable = (el: React.ReactElement) => renderWithConfirm(<table><tbody>{el}</tbody></table>);

  it("the add-user form submits name, email, password and role", async () => {
    actions.createUser.mockResolvedValue({ ok: "Bob added." });
    render(<UserForms />);
    const form = screen.getByRole("button", { name: "Add user" }).closest("form")!;
    for (const [name, value] of [["name", "Bob"], ["email", "bob@x.dev"], ["password", "secret1"]]) fireEvent.change(form.querySelector(`[name=${name}]`)!, { target: { value } });
    fireEvent.change(form.querySelector("[name=role]")!, { target: { value: "admin" } });
    fireEvent.submit(form);
    expect(await screen.findByText("Bob added.")).toBeInTheDocument();
    const fd = actions.createUser.mock.calls[0][1] as FormData;
    expect([fd.get("name"), fd.get("email"), fd.get("password"), fd.get("role")]).toEqual(["Bob", "bob@x.dev", "secret1", "admin"]);
  });

  it("requires a password of at least 6 characters in the form", () => {
    render(<UserForms />);
    expect(document.querySelector("[name=password]")).toHaveAttribute("minlength", "6");
  });

  it("you cannot change your own role or remove yourself", () => {
    inTable(<UserRow user={u({ name: "Me" })} isMe />);
    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    expect(screen.getByText("(you)")).toBeInTheDocument();
  });

  it("changes another user's role", () => {
    actions.setUserRole.mockResolvedValue(undefined);
    inTable(<UserRow user={u()} isMe={false} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "admin" } });
    expect(actions.setUserRole).toHaveBeenCalledWith(2, "admin");
  });

  it("removing a user needs confirmation and explains the consequences", async () => {
    const nativeConfirm = vi.spyOn(window, "confirm");
    inTable(<UserRow user={u()} isMe={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(await confirmDialog()).toHaveTextContent("Remove Bob Jones?");
    await answerConfirm(false);
    expect(actions.deleteUser).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove user" }));
    await waitFor(() => expect(actions.deleteUser).toHaveBeenCalledWith(2));
    expect(nativeConfirm).not.toHaveBeenCalled();
  });
});
