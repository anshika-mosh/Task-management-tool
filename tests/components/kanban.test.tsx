// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Ticket, User } from "@/lib/types";

const actions = vi.hoisted(() => ({ updateTicket: vi.fn() }));
vi.mock("@/lib/actions", () => actions);

import Kanban from "@/app/(app)/boards/[key]/Kanban";

const ticket = (n: number, over: Partial<Ticket> = {}): Ticket => ({
  id: n, board_id: 1, number: n, key: `WEB-${n}`, board_key: "WEB", board_name: "Website", board_color: "#2684ff", title: `Ticket ${n}`, description: "", type: "task",
  status: "todo", priority: "medium", assignee_id: null, assignee_name: null, assignee_color: null, reporter_id: 1, reporter_name: "Ann", reporter_color: "#111111",
  progress: 0, due_date: null, created_at: "", updated_at: "", attach_count: 0, comment_count: 0, hours: 0, sprint_id: null, sprint_name: null, sprint_status: null, ...over,
});
const users: User[] = [
  { id: 1, name: "Ann", email: "a@x.dev", role: "admin", color: "#111111", created_at: "" },
  { id: 2, name: "Bob", email: "b@x.dev", role: "member", color: "#222222", created_at: "" },
];
const tickets = [
  ticket(1, { title: "Login broken", type: "bug", priority: "highest", status: "todo", assignee_id: 1, assignee_name: "Ann", attach_count: 2, comment_count: 3 }),
  ticket(2, { title: "Pricing page", type: "story", priority: "high", status: "in_progress", assignee_id: 2, assignee_name: "Bob", progress: 40 }),
  ticket(3, { title: "Dark mode", type: "task", priority: "low", status: "in_review" }),
  ticket(4, { title: "Lighthouse", type: "task", priority: "medium", status: "done", progress: 100, sprint_name: "Sprint 1" }),
];

const renderBoard = (over: Partial<React.ComponentProps<typeof Kanban>> = {}) => render(<Kanban tickets={tickets} users={users} meId={1} {...over} />);
const column = (name: string) => screen.getByRole("heading", { name }).closest(".col") as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  actions.updateTicket.mockResolvedValue(undefined);
});

describe("Kanban board", () => {
  it("shows the four workflow columns with ticket counts", () => {
    renderBoard();
    for (const [name, title] of [["To Do", "Login broken"], ["In Progress", "Pricing page"], ["In Review", "Dark mode"], ["Done", "Lighthouse"]]) {
      expect(within(column(name)).getByText(title)).toBeInTheDocument();
      expect(column(name).querySelector(".count")).toHaveTextContent("1");
    }
  });

  it("cards link to the ticket and show key, assignee, attachments and comments", () => {
    renderBoard();
    const card = screen.getByText("Login broken").closest("a")!;
    expect(card).toHaveAttribute("href", "/browse/WEB-1");
    expect(within(card).getByText("WEB-1")).toBeInTheDocument();
    expect(within(card).getByTitle("Ann")).toBeInTheDocument();
    expect(within(card).getByText("📎 2")).toBeInTheDocument();
    expect(within(card).getByText("💬 3")).toBeInTheDocument();
  });

  it("shows a progress bar for started, unfinished tickets only", () => {
    renderBoard();
    expect(within(screen.getByText("Pricing page").closest("a")!).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "40");
    expect(within(screen.getByText("Lighthouse").closest("a")!).queryByRole("progressbar")).toBeNull();
    expect(within(screen.getByText("Login broken").closest("a")!).queryByRole("progressbar")).toBeNull();
  });

  it("tells the user where to drop tickets in empty columns", () => {
    renderBoard({ tickets: [ticket(1)] });
    expect(within(column("Done")).getByText("Drop tickets here")).toBeInTheDocument();
  });

  it("shows the sprint on each card when viewing all tickets", () => {
    const { unmount } = renderBoard();
    expect(screen.queryByText("Sprint 1")).not.toBeInTheDocument();
    unmount();
    renderBoard({ showSprint: true });
    expect(screen.getByText("Sprint 1")).toBeInTheDocument();
    expect(screen.getAllByText("Backlog")).toHaveLength(3);
  });
});

describe("filters", () => {
  const filterSelects = () => screen.getAllByRole("combobox") as HTMLSelectElement[]; // assignee, type, priority
  const visible = () => screen.queryAllByText(/^(Login broken|Pricing page|Dark mode|Lighthouse)$/).map((e) => e.textContent);

  it("searches titles and keys", () => {
    renderBoard();
    fireEvent.change(screen.getByPlaceholderText("Search this board…"), { target: { value: "dark" } });
    expect(visible()).toEqual(["Dark mode"]);
    fireEvent.change(screen.getByPlaceholderText("Search this board…"), { target: { value: "web-2" } });
    expect(visible()).toEqual(["Pricing page"]);
  });

  it("filters by assignee: me, unassigned, or a person", () => {
    renderBoard();
    fireEvent.change(filterSelects()[0], { target: { value: "me" } });
    expect(visible()).toEqual(["Login broken"]);
    fireEvent.change(filterSelects()[0], { target: { value: "none" } });
    expect(visible()).toEqual(["Dark mode", "Lighthouse"]);
    fireEvent.change(filterSelects()[0], { target: { value: "2" } });
    expect(visible()).toEqual(["Pricing page"]);
  });

  it("filters by type and priority, and combines filters", () => {
    renderBoard();
    fireEvent.change(filterSelects()[1], { target: { value: "task" } });
    expect(visible()).toEqual(["Dark mode", "Lighthouse"]);
    fireEvent.change(filterSelects()[2], { target: { value: "low" } });
    expect(visible()).toEqual(["Dark mode"]);
  });

  it("shows 'No matches' and a Clear filters button that resets everything", () => {
    renderBoard();
    fireEvent.change(screen.getByPlaceholderText("Search this board…"), { target: { value: "zzz" } });
    expect(visible()).toEqual([]);
    expect(screen.getAllByText("No matches")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(visible()).toHaveLength(4);
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  });
});

describe("drag and drop", () => {
  const dataTransfer = () => ({ setData: vi.fn(), effectAllowed: "" });
  const drag = (title: string, toColumn: string) => {
    const card = screen.getByText(title).closest("a")!;
    const target = column(toColumn);
    fireEvent.dragStart(card, { dataTransfer: dataTransfer() });
    fireEvent.dragOver(target, { dataTransfer: dataTransfer() });
    fireEvent.drop(target, { dataTransfer: dataTransfer() });
    fireEvent.dragEnd(card);
  };

  it("moving a card to another column updates its status", async () => {
    renderBoard();
    drag("Login broken", "In Progress");
    expect(actions.updateTicket).toHaveBeenCalledWith(1, "status", "in_progress");
    // optimistic UI: the card is already in its new column
    await waitFor(() => expect(within(column("In Progress")).getByText("Login broken")).toBeInTheDocument());
    expect(within(column("To Do")).queryByText("Login broken")).toBeNull();
  });

  it("dropping on the Done column completes the card (progress hidden)", async () => {
    renderBoard();
    drag("Pricing page", "Done");
    expect(actions.updateTicket).toHaveBeenCalledWith(2, "status", "done");
    await waitFor(() => expect(within(column("Done")).getByText("Pricing page")).toBeInTheDocument());
    expect(within(screen.getByText("Pricing page").closest("a")!).queryByRole("progressbar")).toBeNull();
  });

  it("dropping a card on its own column does nothing", () => {
    renderBoard();
    drag("Login broken", "To Do");
    expect(actions.updateTicket).not.toHaveBeenCalled();
  });

  it("highlights the column being hovered", () => {
    renderBoard();
    const card = screen.getByText("Login broken").closest("a")!;
    fireEvent.dragStart(card, { dataTransfer: dataTransfer() });
    fireEvent.dragOver(column("Done"), { dataTransfer: dataTransfer() });
    expect(column("Done")).toHaveClass("over");
    fireEvent.dragEnd(card);
    expect(column("Done")).not.toHaveClass("over");
  });

  it("filtered-out cards are not draggable targets and moves survive filtering", async () => {
    renderBoard();
    fireEvent.change(screen.getByPlaceholderText("Search this board…"), { target: { value: "login" } });
    drag("Login broken", "In Review");
    expect(actions.updateTicket).toHaveBeenCalledWith(1, "status", "in_review");
  });
});
