// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Avatar, BoardAvatar, PriorityIcon, ProgressBar, StatusLozenge, TypeIcon } from "@/components/ui";
import ActivityLine, { describe as describeActivity } from "@/components/ActivityLine";
import Modal from "@/components/Modal";
import type { Activity } from "@/lib/types";

describe("ui primitives", () => {
  it("Avatar shows initials with a name tooltip, or ? when unassigned", () => {
    const { rerender } = render(<Avatar name="Priya Sharma" color="#36b37e" />);
    expect(screen.getByTitle("Priya Sharma")).toHaveTextContent("PS");
    rerender(<Avatar name={null} />);
    expect(screen.getByTitle("Unassigned")).toHaveTextContent("?");
  });

  it("TypeIcon / PriorityIcon / StatusLozenge show the right labels", () => {
    render(<><TypeIcon type="bug" /><PriorityIcon priority="highest" label /><StatusLozenge status="in_review" /></>);
    expect(screen.getByTitle("Bug")).toBeInTheDocument();
    expect(screen.getByText("Highest")).toBeInTheDocument();
    expect(screen.getByText("In Review")).toBeInTheDocument();
  });

  it("PriorityIcon only prints the label when asked", () => {
    render(<PriorityIcon priority="low" />);
    expect(screen.queryByText("Low")).not.toBeInTheDocument();
    expect(screen.getByTitle("Low")).toBeInTheDocument();
  });

  it("ProgressBar exposes its value to assistive tech", () => {
    render(<ProgressBar value={42} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "42");
    expect(bar.firstElementChild).toHaveStyle({ width: "42%" });
  });

  it("BoardAvatar shows the first three letters of the key", () => {
    render(<BoardAvatar boardKey="WEBSITE" color="#2684ff" />);
    expect(screen.getByText("WEB")).toBeInTheDocument();
  });
});

describe("Modal", () => {
  it("closes on Escape and on a click of the backdrop, but not when clicking inside", () => {
    const onClose = vi.fn();
    render(<Modal onClose={onClose}><button>inside</button></Modal>);
    fireEvent.click(screen.getByText("inside"));
    fireEvent.mouseDown(screen.getByText("inside"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.mouseDown(screen.getByRole("dialog").parentElement!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

const act = (over: Partial<Activity>): Activity => ({
  id: 1, ticket_id: 1, user_id: 1, user_name: "Ann", user_color: "#111111", action: "changed", field: null, old_value: null, new_value: null, created_at: new Date().toISOString(), ...over,
});

describe("ActivityLine", () => {
  it("describes the different kinds of history entries", () => {
    const text = (a: Activity) => { const { container } = render(<>{describeActivity(a)}</>); return container.textContent; };
    expect(text(act({ action: "created" }))).toBe("created this ticket");
    expect(text(act({ action: "added", new_value: "shot.png" }))).toBe("attached shot.png");
    expect(text(act({ action: "removed", old_value: "shot.png" }))).toBe("removed attachment shot.png");
    expect(text(act({ field: "Status", old_value: "todo", new_value: "done" }))).toBe("changed Status from todo to done");
    expect(text(act({ field: "Due date", old_value: null, new_value: "2026-01-01" }))).toBe("changed Due date to 2026-01-01");
    expect(text(act({ field: "Description" }))).toBe("updated the description");
    expect(text(act({ field: "Assigned to", old_value: "Bob", new_value: null }))).toBe("changed Assigned to from Bob (cleared)");
  });

  it("links to the ticket when shown in the home feed", () => {
    render(<ActivityLine a={act({ action: "created", ticket_key: "WEB-3", ticket_title: "Dark mode" })} showTicket />);
    expect(screen.getByRole("link", { name: "WEB-3" })).toHaveAttribute("href", "/browse/WEB-3");
    expect(screen.getByText("Dark mode")).toBeInTheDocument();
    expect(screen.getByText("just now")).toBeInTheDocument();
  });
});
