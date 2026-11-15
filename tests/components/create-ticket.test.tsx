// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { router } from "../mocks/state";
import type { Board, User } from "@/lib/types";

const actions = vi.hoisted(() => ({ createTicket: vi.fn() }));
const uploader = vi.hoisted(() => ({ uploadFiles: vi.fn() }));
vi.mock("@/lib/actions", () => actions);
vi.mock("@/components/uploader", () => uploader);

import CreateTicket from "@/components/CreateTicket";

const boards: Board[] = [
  { id: 1, key: "WEB", name: "Website", description: "", color: "#2684ff", counter: 0, created_at: "" },
  { id: 2, key: "MOB", name: "Mobile", description: "", color: "#36b37e", counter: 0, created_at: "" },
];
const users: User[] = [
  { id: 10, name: "Priya Sharma", email: "p@x.dev", role: "member", color: "#111111", created_at: "" },
  { id: 11, name: "Alex Morgan", email: "a@x.dev", role: "member", color: "#222222", created_at: "" },
];
const sprints = [
  { id: 100, board_id: 1, name: "WEB Sprint 1", status: "active" },
  { id: 101, board_id: 1, name: "WEB Sprint 2", status: "planned" },
  { id: 200, board_id: 2, name: "MOB Sprint 1", status: "planned" },
];

const onClose = vi.fn();
const field = (name: string) => document.querySelector(`[name="${name}"]`) as HTMLInputElement;
const boardSelect = () => screen.getAllByRole("combobox")[0] as HTMLSelectElement;
const renderIt = (over: Partial<React.ComponentProps<typeof CreateTicket>> = {}) =>
  render(<CreateTicket boards={boards} users={users} sprints={sprints} allowUploads={false} onClose={onClose} {...over} />);
const submit = () => fireEvent.submit(screen.getByRole("button", { name: "Create" }).closest("form")!);

beforeEach(() => {
  vi.clearAllMocks();
  actions.createTicket.mockResolvedValue({ key: "WEB-7" });
});

describe("CreateTicket dialog", () => {
  it("offers every board, type, priority and assignee", () => {
    renderIt();
    expect(within(boardSelect()).getAllByRole("option").map((o) => o.textContent)).toEqual(["Website (WEB)", "Mobile (MOB)"]);
    expect(within(field("type") as unknown as HTMLElement).getAllByRole("option").map((o) => o.textContent)).toEqual(["Task", "Story", "Bug", "Epic"]);
    expect(within(field("priority") as unknown as HTMLElement).getAllByRole("option")).toHaveLength(5);
    expect(within(field("assignee") as unknown as HTMLElement).getAllByRole("option").map((o) => o.textContent)).toEqual(["Unassigned", "Priya Sharma", "Alex Morgan"]);
    expect(field("title")).toBeRequired();
  });

  it("preselects the given board, otherwise the first", () => {
    const { unmount } = renderIt();
    expect(boardSelect().value).toBe("1");
    unmount();
    renderIt({ defaultBoardId: 2 });
    expect(boardSelect().value).toBe("2");
  });

  it("sprint choices follow the board and default to its active sprint", () => {
    renderIt();
    const sprint = () => field("sprint") as unknown as HTMLSelectElement;
    expect(within(sprint()).getAllByRole("option").map((o) => o.textContent)).toEqual(["Backlog (no sprint)", "WEB Sprint 1 (active)", "WEB Sprint 2"]);
    expect(sprint().value).toBe("100");
    fireEvent.change(boardSelect(), { target: { value: "2" } });
    expect(within(sprint()).getAllByRole("option").map((o) => o.textContent)).toEqual(["Backlog (no sprint)", "MOB Sprint 1"]);
    expect(sprint().value).toBe(""); // MOB has no active sprint
  });

  it("creates the ticket and opens it", async () => {
    renderIt();
    fireEvent.change(field("title"), { target: { value: "Fix login" } });
    fireEvent.change(field("description"), { target: { value: "Steps…" } });
    fireEvent.change(field("type"), { target: { value: "bug" } });
    fireEvent.change(field("priority"), { target: { value: "highest" } });
    fireEvent.change(field("assignee"), { target: { value: "11" } });
    fireEvent.change(field("due"), { target: { value: "2026-12-31" } });
    submit();
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/browse/WEB-7"));
    expect(actions.createTicket).toHaveBeenCalledWith({
      boardId: 1, title: "Fix login", description: "Steps…", type: "bug", priority: "highest", assigneeId: 11, dueDate: "2026-12-31", sprintId: 100, links: [],
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("sends null for no assignee / no due date / backlog", async () => {
    renderIt({ sprints: [] });
    fireEvent.change(field("title"), { target: { value: "Minimal" } });
    submit();
    await waitFor(() => expect(actions.createTicket).toHaveBeenCalled());
    expect(actions.createTicket.mock.calls[0][0]).toMatchObject({ assigneeId: null, dueDate: null, sprintId: null });
  });

  it("shows the server's error and stays open", async () => {
    actions.createTicket.mockResolvedValue({ error: "Summary is required." });
    renderIt();
    fireEvent.change(field("title"), { target: { value: " " } });
    submit();
    expect(await screen.findByText("Summary is required.")).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes with Cancel and Escape", () => {
    renderIt();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("attaching Google Drive links while creating", () => {
  const url = () => screen.getByLabelText("Link URL") as HTMLInputElement;
  const name = () => screen.getByLabelText("Link name") as HTMLInputElement;
  const DRIVE = "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrSt/view";

  it("adds a link to the list with the Add button and clears the inputs", () => {
    renderIt();
    fireEvent.change(url(), { target: { value: DRIVE } });
    fireEvent.change(name(), { target: { value: "Mockup.png" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByText(/Mockup\.png/)).toBeInTheDocument();
    expect(url().value).toBe("");
    expect(name().value).toBe("");
  });

  it("Enter in the URL box adds the link instead of submitting the form", () => {
    renderIt();
    fireEvent.change(url(), { target: { value: DRIVE } });
    fireEvent.keyDown(url(), { key: "Enter" });
    expect(screen.getByText(/1AbCdEfGhIjKlMnOpQrSt\/view/)).toBeInTheDocument();
    expect(actions.createTicket).not.toHaveBeenCalled();
  });

  it("ignores an empty Add, and removes links again", () => {
    renderIt();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    fireEvent.change(url(), { target: { value: DRIVE } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.queryByText(/1AbCdEfGhIjKlMnOpQrSt\/view/)).not.toBeInTheDocument();
  });

  it("submits added links, plus a link that was typed but never added", async () => {
    renderIt();
    fireEvent.change(field("title"), { target: { value: "With media" } });
    fireEvent.change(url(), { target: { value: DRIVE } });
    fireEvent.change(name(), { target: { value: "A.png" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.change(url(), { target: { value: "https://cdn.test/clip.mp4" } });
    submit();
    await waitFor(() => expect(actions.createTicket).toHaveBeenCalled());
    expect(actions.createTicket.mock.calls[0][0].links).toEqual([
      { url: DRIVE, name: "A.png" },
      { url: "https://cdn.test/clip.mp4", name: "" },
    ]);
  });
});

describe("local file uploads (off by default)", () => {
  it("hides the file picker unless uploads are enabled", () => {
    renderIt();
    expect(screen.queryByRole("button", { name: /Add files/ })).not.toBeInTheDocument();
  });

  it("when enabled: lists chosen files, and uploads them after the ticket exists", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: 55 })));
    uploader.uploadFiles.mockResolvedValue(undefined);
    renderIt({ allowUploads: true });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["abc"], "notes.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByText(/notes\.txt/)).toBeInTheDocument();
    fireEvent.change(field("title"), { target: { value: "Has file" } });
    submit();
    await waitFor(() => expect(uploader.uploadFiles).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledWith("/api/ticket-id?key=WEB-7");
    expect(uploader.uploadFiles.mock.calls[0][0]).toBe(55);
    expect(uploader.uploadFiles.mock.calls[0][1]).toEqual([file]);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/browse/WEB-7"));
  });

  it("when the upload fails the ticket still opens and the error is reported", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: 55 })));
    uploader.uploadFiles.mockRejectedValue(new Error("File uploads are disabled."));
    renderIt({ allowUploads: true });
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [new File(["x"], "a.txt")] } });
    fireEvent.change(field("title"), { target: { value: "Has file" } });
    submit();
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/browse/WEB-7"));
    expect(await screen.findByText(/Ticket WEB-7 created, but attachments failed: File uploads are disabled\./)).toBeInTheDocument();
  });
});
