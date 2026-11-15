// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { router } from "../mocks/state";
import type { Attachment } from "@/lib/types";
import { answerConfirm, confirmDialog, editorAt, renderWithConfirm, typeInto } from "./utils";

const actions = vi.hoisted(() => ({
  addComment: vi.fn(), addLinkAttachment: vi.fn(), addProgress: vi.fn(), deleteAttachment: vi.fn(), deleteComment: vi.fn(), deleteTicket: vi.fn(), updateTicket: vi.fn(),
}));
const uploader = vi.hoisted(() => ({ uploadFiles: vi.fn() }));
vi.mock("@/lib/actions", () => actions);
vi.mock("@/components/uploader", () => uploader);

import {
  AssignToMe, Attachments, CommentForm, DeleteComment, DeleteTicket, DescriptionEditor, FieldSelect, ProgressForm, Tabs, TitleEditor,
} from "@/app/(app)/browse/[ticket]/TicketClient";

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  actions.updateTicket.mockResolvedValue(undefined);
});

describe("TitleEditor", () => {
  const box = () => screen.getByLabelText("Ticket summary") as HTMLInputElement;

  it("saves a changed title when you leave the field", () => {
    render(<TitleEditor id={5} value="Old title" />);
    fireEvent.change(box(), { target: { value: "New title" } });
    fireEvent.blur(box());
    expect(actions.updateTicket).toHaveBeenCalledWith(5, "title", "New title");
  });

  it("does not save when nothing changed or the title is blank", () => {
    render(<TitleEditor id={5} value="Old title" />);
    fireEvent.blur(box());
    fireEvent.change(box(), { target: { value: "   " } });
    fireEvent.blur(box());
    expect(actions.updateTicket).not.toHaveBeenCalled();
  });

  it("Escape reverts the edit", () => {
    render(<TitleEditor id={5} value="Old title" />);
    box().focus();
    fireEvent.change(box(), { target: { value: "Oops" } });
    fireEvent.keyDown(box(), { key: "Escape" });
    expect(box().value).toBe("Old title");
  });

  it("Enter commits the edit", () => {
    render(<TitleEditor id={5} value="Old title" />);
    box().focus();
    fireEvent.change(box(), { target: { value: "Via enter" } });
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(actions.updateTicket).toHaveBeenCalledWith(5, "title", "Via enter");
  });
});

describe("DescriptionEditor (rich text)", () => {
  it("shows the formatted description; clicking it opens the editor", async () => {
    render(<DescriptionEditor id={5} html="<h2>Plan</h2><ul><li><p>one</p></li></ul>" />);
    expect(screen.getByRole("heading", { name: "Plan" })).toBeInTheDocument();
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("one"));
    expect(await screen.findByRole("toolbar", { name: "Formatting" })).toBeInTheDocument();
    expect(editorAt().getHTML()).toContain("<h2>Plan</h2>");
  });

  it("an Edit button also opens it (keyboard friendly)", async () => {
    render(<DescriptionEditor id={5} html="<p>text</p>" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit description" }));
    expect(await screen.findByRole("toolbar")).toBeInTheDocument();
  });

  it("clicking a link inside the description does not open the editor", () => {
    render(<DescriptionEditor id={5} html='<p><a href="https://x.test">a link</a></p>' />);
    fireEvent.click(screen.getByRole("link", { name: "a link" }));
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });

  it("shows a placeholder when empty; Save stays disabled until something changes, then saves the HTML", async () => {
    render(<DescriptionEditor id={5} html="" />);
    fireEvent.click(screen.getByText("Add a description…"));
    await screen.findByRole("toolbar");
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    typeInto(0, "Fresh text");
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(actions.updateTicket).toHaveBeenCalledWith(5, "description", "<p>Fresh text</p>"));
    await waitFor(() => expect(screen.queryByRole("toolbar")).not.toBeInTheDocument());
  });

  it("regression: opening a description that ends in a table/divider does not count as an edit", async () => {
    render(<DescriptionEditor id={5} html="<p>intro</p><hr /><table><tbody><tr><th><p>h</p></th></tr><tr><td><p>c</p></td></tr></tbody></table>" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit description" }));
    await screen.findByRole("toolbar");
    await new Promise((r) => setTimeout(r, 100)); // the editor adds a blank paragraph after a table
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    typeInto(0, " more");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("Save becomes disabled again when the edit is undone back to the original", async () => {
    render(<DescriptionEditor id={5} html="<p>original</p>" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit description" }));
    await screen.findByRole("toolbar");
    typeInto(0, " changed");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    act(() => { editorAt().commands.undo(); });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("clearing everything saves an empty description", async () => {
    render(<DescriptionEditor id={5} html="<p>old</p>" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit description" }));
    await screen.findByRole("toolbar");
    act(() => { editorAt().commands.clearContent(true); });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(actions.updateTicket).toHaveBeenCalledWith(5, "description", ""));
  });

  it("Cancel discards the edit", async () => {
    render(<DescriptionEditor id={5} html="<p>Original</p>" />);
    fireEvent.click(screen.getByText("Original"));
    await screen.findByRole("toolbar");
    typeInto(0, " changed");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Original")).toBeInTheDocument();
    expect(actions.updateTicket).not.toHaveBeenCalled();
  });

  it("the paperclip attaches a Drive file: it lands in the text AND is registered as a ticket attachment", async () => {
    actions.addLinkAttachment.mockResolvedValue({ ok: "Link attached." });
    render(<DescriptionEditor id={5} html="<p>see</p>" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit description" }));
    await screen.findByRole("toolbar");
    fireEvent.click(screen.getByRole("button", { name: "Attach image, video or file" }));
    const dialog = await screen.findByRole("dialog", { name: "Attach image, video or file" });
    fireEvent.change(within(dialog).getByLabelText("Link"), { target: { value: "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrSt/view" } });
    fireEvent.change(within(dialog).getByLabelText(/Name/), { target: { value: "Mockup.png" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Attach" }));
    await waitFor(() => expect(actions.addLinkAttachment).toHaveBeenCalled());
    const [id, , fd] = actions.addLinkAttachment.mock.calls[0];
    expect([id, (fd as FormData).get("url"), (fd as FormData).get("name")]).toEqual([5, "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrSt/view", "Mockup.png"]);
    expect(editorAt().getHTML()).toContain('data-drive-id="1AbCdEfGhIjKlMnOpQrSt"');
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("shows the server's error if registering the attachment fails", async () => {
    actions.addLinkAttachment.mockResolvedValue({ error: "Ticket not found." });
    render(<DescriptionEditor id={5} html="<p>x</p>" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit description" }));
    await screen.findByRole("toolbar");
    fireEvent.click(screen.getByRole("button", { name: "Attach image, video or file" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Link"), { target: { value: "https://cdn.test/clip.mp4" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Attach" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ticket not found.");
  });
});

describe("FieldSelect (status, priority, assignee, sprint, due date)", () => {
  const options = [{ id: "", label: "Unassigned" }, { id: 10, label: "Priya" }, { id: 11, label: "Alex" }];

  it("saves the chosen value", () => {
    render(<FieldSelect id={5} field="status" value="todo" options={[{ id: "todo", label: "To Do" }, { id: "done", label: "Done" }]} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "done" } });
    expect(actions.updateTicket).toHaveBeenCalledWith(5, "status", "done");
  });

  it("choosing Unassigned sends null", () => {
    render(<FieldSelect id={5} field="assignee_id" value={10} options={options} />);
    expect(screen.getByRole("combobox")).toHaveValue("10");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "" } });
    expect(actions.updateTicket).toHaveBeenCalledWith(5, "assignee_id", null);
  });

  it("renders a date picker for due dates", () => {
    const { container } = render(<FieldSelect id={5} field="due_date" type="date" value="2026-01-02" />);
    const input = container.querySelector('input[type="date"]') as HTMLInputElement;
    expect(input.value).toBe("2026-01-02");
    fireEvent.change(input, { target: { value: "2026-03-04" } });
    expect(actions.updateTicket).toHaveBeenCalledWith(5, "due_date", "2026-03-04");
  });
});

describe("AssignToMe / DeleteTicket / DeleteComment (in-app confirmation, no browser dialogs)", () => {
  it("Assign to me assigns the signed-in user", () => {
    render(<AssignToMe id={5} meId={3} />);
    fireEvent.click(screen.getByRole("button", { name: "Assign to me" }));
    expect(actions.updateTicket).toHaveBeenCalledWith(5, "assignee_id", 3);
  });

  it("DeleteTicket asks in a modal; cancelling keeps the ticket, confirming deletes it", async () => {
    const nativeConfirm = vi.spyOn(window, "confirm");
    renderWithConfirm(<DeleteTicket id={5} ticketKey="WEB-5" />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await confirmDialog();
    expect(dialog).toHaveTextContent("Delete WEB-5?");
    expect(dialog).toHaveTextContent(/cannot be undone/);
    await answerConfirm(false);
    expect(actions.deleteTicket).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete ticket" }));
    await waitFor(() => expect(actions.deleteTicket).toHaveBeenCalledWith(5));
    expect(nativeConfirm).not.toHaveBeenCalled();
  });

  it("DeleteComment asks in a modal first", async () => {
    renderWithConfirm(<DeleteComment id={9} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await answerConfirm(false);
    expect(actions.deleteComment).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(await within(await confirmDialog()).findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(actions.deleteComment).toHaveBeenCalledWith(9));
  });
});

describe("Tabs", () => {
  it("switches between panels", () => {
    render(<Tabs tabs={[{ id: "a", label: "Comments", content: <p>panel A</p> }, { id: "b", label: "History", content: <p>panel B</p> }]} />);
    expect(screen.getByText("panel A")).toBeInTheDocument();
    expect(screen.queryByText("panel B")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "History" }));
    expect(screen.getByText("panel B")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "History" })).toHaveClass("active");
  });
});

describe("CommentForm (rich text)", () => {
  it("posts the formatted comment against the ticket, then clears the editor", async () => {
    actions.addComment.mockResolvedValue({ ok: "Comment added." });
    render(<CommentForm ticketId={5} />);
    await screen.findByRole("toolbar");
    typeInto(0, "Looks good");
    act(() => { editorAt().chain().focus().selectAll().toggleBold().run(); });
    fireEvent.submit(screen.getByRole("button", { name: "Comment" }).closest("form")!);
    await waitFor(() => expect(actions.addComment).toHaveBeenCalled());
    const [id, , fd] = actions.addComment.mock.calls[0];
    expect(id).toBe(5);
    expect((fd as FormData).get("body")).toBe("<p><strong>Looks good</strong></p>");
    await waitFor(() => expect(editorAt().isEmpty).toBe(true));
  });

  it("has the full formatting toolbar (same as the description)", async () => {
    render(<CommentForm ticketId={5} />);
    const bar = await screen.findByRole("toolbar", { name: "Formatting" });
    for (const label of ["Bold", "Italic", "Underline", "Bullet list", "Numbered list", "Code block", "Quote", "Table", "Attach image, video or file"]) {
      expect(within(bar).getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("an empty comment submits an empty body (the server rejects it) and shows its error", async () => {
    actions.addComment.mockResolvedValue({ error: "Write something first." });
    render(<CommentForm ticketId={5} />);
    await screen.findByRole("toolbar");
    fireEvent.submit(screen.getByRole("button", { name: "Comment" }).closest("form")!);
    expect(await screen.findByText("Write something first.")).toBeInTheDocument();
    expect(((actions.addComment.mock.calls[0][2]) as FormData).get("body")).toBe("");
  });
});

describe("ProgressForm (rich text)", () => {
  it("starts at the ticket's progress and submits the formatted note, percentage and hours", async () => {
    actions.addProgress.mockResolvedValue({ ok: "Progress update posted." });
    render(<ProgressForm ticketId={5} current={55} />);
    await screen.findByRole("toolbar");
    expect(screen.getByText("55%", { selector: "b" })).toBeInTheDocument();
    const slider = screen.getByRole("slider");
    expect(slider).toHaveValue("55");
    fireEvent.change(slider, { target: { value: "80" } });
    expect(screen.getByText("80%", { selector: "b" })).toBeInTheDocument();
    typeInto(0, "Table finished");
    act(() => { editorAt().chain().focus().selectAll().toggleBulletList().run(); });
    fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: "2.5" } });
    fireEvent.submit(slider.closest("form")!);
    expect(await screen.findByText("Progress update posted.")).toBeInTheDocument();
    const fd = actions.addProgress.mock.calls[0][2] as FormData;
    expect(actions.addProgress.mock.calls[0][0]).toBe(5);
    expect(String(fd.get("body"))).toMatch(/^<ul><li><p>Table finished<\/p><\/li><\/ul>/); // the server trims any trailing blank paragraph
    expect([fd.get("progress"), fd.get("hours")]).toEqual(["80", "2.5"]);
    await waitFor(() => expect(editorAt().isEmpty).toBe(true));
    expect((screen.getByPlaceholderText("0") as HTMLInputElement).value).toBe("");
  });
});

/* ------------------------------ attachments ------------------------------ */

const att = (over: Partial<Attachment> = {}): Attachment => ({
  id: 1, ticket_id: 5, user_id: 1, user_name: "Ann", filename: "Mockup.png", mime: "", size: 0, created_at: new Date().toISOString(),
  kind: "link", link_type: "drive", url: "https://drive.google.com/file/d/ABCDEFGHIJKL/view?usp=sharing", drive_id: "ABCDEFGHIJKL", ...over,
});
const renderAtt = (items: Attachment[], over: Partial<React.ComponentProps<typeof Attachments>> = {}) =>
  renderWithConfirm(<Attachments ticketId={5} items={items} meId={1} isAdmin={false} allowUploads={false} {...over} />);

describe("Attachments gallery", () => {
  it("no longer has its own link form: attaching happens with the paperclip in the editor", () => {
    renderAtt([att()]);
    expect(screen.queryByLabelText("Link URL")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Attach link/ })).not.toBeInTheDocument();
  });

  it("shows a Drive thumbnail with the file name and source", () => {
    const { container } = renderAtt([att()]);
    expect(container.querySelector("img")).toHaveAttribute("src", "https://drive.google.com/thumbnail?id=ABCDEFGHIJKL&sz=w480");
    const link = screen.getByRole("link", { name: "Mockup.png" });
    expect(link).toHaveAttribute("href", "https://drive.google.com/file/d/ABCDEFGHIJKL/view?usp=sharing");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(screen.getByText(/Google Drive · Ann/)).toBeInTheDocument();
  });

  it("falls back to an icon when the thumbnail cannot be loaded (e.g. private file)", () => {
    const { container } = renderAtt([att()]);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".thumb")).toHaveTextContent("🖼️");
  });

  it("opens Drive files in an embedded viewer (plays videos, shows images) that closes on click or Escape", () => {
    const { container } = renderAtt([att()]);
    fireEvent.click(screen.getByRole("button", { name: "Open Mockup.png" }));
    expect(container.querySelector("iframe")).toHaveAttribute("src", "https://drive.google.com/file/d/ABCDEFGHIJKL/preview");
    expect(screen.getByRole("link", { name: "Open in Drive ↗" })).toHaveAttribute("href", expect.stringContaining("drive.google.com/file/d/ABCDEFGHIJKL"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(container.querySelector("iframe")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open Mockup.png" }));
    fireEvent.click(container.querySelector(".lightbox")!);
    expect(container.querySelector(".lightbox")).toBeNull();
  });

  it("previews direct image and video links", () => {
    const { container } = renderAtt([
      att({ id: 2, filename: "pic.jpg", link_type: "image", url: "https://cdn.test/pic.jpg", drive_id: null }),
      att({ id: 3, filename: "clip.mp4", link_type: "video", url: "https://cdn.test/clip.mp4", drive_id: null }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Open pic.jpg" }));
    expect(container.querySelector(".lightbox img")).toHaveAttribute("src", "https://cdn.test/pic.jpg");
    fireEvent.click(container.querySelector(".lightbox")!);
    fireEvent.click(screen.getByRole("button", { name: "Open clip.mp4" }));
    expect(container.querySelector(".lightbox video")).toHaveAttribute("src", "https://cdn.test/clip.mp4");
  });

  it("opens ordinary links in a new tab instead of a viewer", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const { container } = renderAtt([att({ id: 4, filename: "Loom", link_type: "web", url: "https://loom.com/share/x", drive_id: null })]);
    fireEvent.click(screen.getByRole("button", { name: "Open Loom" }));
    expect(open).toHaveBeenCalledWith("https://loom.com/share/x", "_blank", "noopener");
    expect(container.querySelector(".lightbox")).toBeNull();
    expect(screen.getByText(/Link · Ann/)).toBeInTheDocument();
  });

  it("shows locally uploaded files with a size and a download link", () => {
    renderAtt([att({ id: 9, kind: "file", link_type: null, url: null, drive_id: null, filename: "report.pdf", mime: "application/pdf", size: 2048 })]);
    expect(screen.getByRole("link", { name: "report.pdf" })).toHaveAttribute("href", "/api/files/9?download=1");
    expect(screen.getByText(/2\.0 KB · Ann/)).toBeInTheDocument();
  });

  it("removing an attachment asks in a modal; only the uploader and admins can", async () => {
    const nativeConfirm = vi.spyOn(window, "confirm");
    const { unmount } = renderAtt([att({ user_id: 99 })], { meId: 1, isAdmin: false });
    expect(screen.queryByTitle("Remove attachment")).not.toBeInTheDocument();
    unmount();

    const { unmount: u2 } = renderAtt([att({ user_id: 99 })], { meId: 1, isAdmin: true });
    fireEvent.click(screen.getByTitle("Remove attachment"));
    expect(await confirmDialog()).toHaveTextContent("Mockup.png");
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(actions.deleteAttachment).toHaveBeenCalledWith(1));
    u2();

    actions.deleteAttachment.mockClear();
    renderAtt([att({ user_id: 1 })], { meId: 1, isAdmin: false });
    fireEvent.click(screen.getByTitle("Remove attachment"));
    await answerConfirm(false);
    expect(actions.deleteAttachment).not.toHaveBeenCalled(); // declined
    expect(nativeConfirm).not.toHaveBeenCalled();
  });

  it("hides the drop zone unless local uploads are enabled", () => {
    renderAtt([att()]);
    expect(screen.queryByText(/drop files here/i)).not.toBeInTheDocument();
  });

  it("with uploads enabled: uploads chosen files and refreshes the page", async () => {
    uploader.uploadFiles.mockResolvedValue(undefined);
    const { container } = renderAtt([], { allowUploads: true });
    expect(screen.getByText(/drop files here/i)).toBeInTheDocument();
    const file = new File(["x"], "a.txt");
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await waitFor(() => expect(uploader.uploadFiles).toHaveBeenCalledWith(5, [file], expect.any(Function)));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("with uploads enabled: reports upload failures", async () => {
    uploader.uploadFiles.mockRejectedValue(new Error("a.txt exceeds 300 MB"));
    const { container } = renderAtt([], { allowUploads: true });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(["x"], "a.txt")] } });
    expect(await screen.findByText("a.txt exceeds 300 MB")).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("with uploads enabled: pasted screenshots are uploaded", async () => {
    uploader.uploadFiles.mockResolvedValue(undefined);
    renderAtt([], { allowUploads: true });
    const shot = new File(["png"], "screenshot.png", { type: "image/png" });
    const ev = new Event("paste", { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown };
    ev.clipboardData = { files: [shot] };
    document.dispatchEvent(ev);
    await waitFor(() => expect(uploader.uploadFiles).toHaveBeenCalledWith(5, [shot], expect.any(Function)));
  });

  it("with uploads disabled: pasted files are ignored", () => {
    renderAtt([], { allowUploads: false });
    const ev = new Event("paste", { bubbles: true }) as Event & { clipboardData: unknown };
    ev.clipboardData = { files: [new File(["png"], "s.png", { type: "image/png" })] };
    document.dispatchEvent(ev);
    expect(uploader.uploadFiles).not.toHaveBeenCalled();
  });
});

describe("FieldSelect inside a details panel", () => {
  it("renders all options with the current one selected", () => {
    const { container } = render(<div><FieldSelect id={1} field="priority" value="high" options={[{ id: "low", label: "Low" }, { id: "high", label: "High" }]} /></div>);
    expect(within(container).getByRole("combobox")).toHaveValue("high");
  });
});
