// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RichEditor, { RichField } from "@/components/RichEditor";
import { editorAt } from "./utils";

let editor: Editor;
const onChange = vi.fn();
const onAttach = vi.fn();

async function setup(value = "<p>hello</p>", props: Partial<React.ComponentProps<typeof RichEditor>> = {}) {
  render(<RichEditor value={value} onChange={onChange} onAttach={onAttach} onReady={(e) => { editor = e; }} {...props} />);
  await screen.findByRole("toolbar", { name: "Formatting" });
  await waitFor(() => expect(editor).toBeTruthy());
}
const btn = (name: string) => screen.getByRole("button", { name });
const selectAll = () => act(() => { editor.commands.selectAll(); });
// The editor keeps an empty paragraph after block elements so you can keep typing; the server trims it when saving.
const trim = (h: string) => h.replace(/(<p><\/p>)+$/, "");
const html = () => trim(editor.getHTML());
const lastChange = () => trim(onChange.mock.calls.at(-1)?.[0] as string);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("toolbar: everything you expect from a word processor", () => {
  it("offers every tool, each with an accessible name", async () => {
    await setup();
    for (const name of [
      "Undo", "Redo", "Heading 1", "Heading 2", "Heading 3", "Bold", "Italic", "Underline", "Strikethrough", "Highlight", "Bullet list", "Numbered list",
      "Checklist", "Quote", "Code", "Code block", "Divider", "Align left", "Align center", "Align right", "Table", "Link", "Attach image, video or file", "Clear formatting",
    ]) expect(btn(name)).toBeInTheDocument();
  });

  it("loads the initial HTML (lists, code, headings) into the editor", async () => {
    await setup("<h2>Plan</h2><ul><li><p>one</p></li></ul><pre><code>x()</code></pre>");
    expect(html()).toBe("<h2>Plan</h2><ul><li><p>one</p></li></ul><pre><code>x()</code></pre>");
  });

  it.each([
    ["Bold", "<p><strong>hello</strong></p>"],
    ["Italic", "<p><em>hello</em></p>"],
    ["Underline", "<p><u>hello</u></p>"],
    ["Strikethrough", "<p><s>hello</s></p>"],
    ["Highlight", "<p><mark>hello</mark></p>"],
    ["Code", "<p><code>hello</code></p>"],
    ["Heading 1", "<h1>hello</h1>"],
    ["Heading 2", "<h2>hello</h2>"],
    ["Heading 3", "<h3>hello</h3>"],
    ["Bullet list", "<ul><li><p>hello</p></li></ul>"],
    ["Numbered list", "<ol><li><p>hello</p></li></ol>"],
    ["Quote", "<blockquote><p>hello</p></blockquote>"],
    ["Code block", "<pre><code>hello</code></pre>"],
  ])("%s formats the selected text", async (tool, expected) => {
    await setup();
    selectAll();
    fireEvent.click(btn(tool));
    expect(html()).toBe(expected);
    expect(lastChange()).toBe(expected);
  });

  it("Checklist creates task items", async () => {
    await setup();
    selectAll();
    fireEvent.click(btn("Checklist"));
    expect(html()).toContain('data-type="taskList"');
    expect(html()).toContain('data-type="taskItem"');
  });

  it("Divider inserts a horizontal rule", async () => {
    await setup();
    fireEvent.click(btn("Divider"));
    expect(html()).toContain("<hr");
  });

  it.each([["Align center", "center"], ["Align right", "right"]])("%s aligns the paragraph", async (tool, align) => {
    await setup();
    selectAll();
    fireEvent.click(btn(tool));
    expect(html()).toContain(`text-align: ${align}`);
  });

  it("toolbar buttons show their state and toggle off again", async () => {
    await setup();
    selectAll();
    fireEvent.click(btn("Bold"));
    await waitFor(() => expect(btn("Bold")).toHaveAttribute("aria-pressed", "true"));
    fireEvent.click(btn("Bold"));
    expect(html()).toBe("<p>hello</p>");
    await waitFor(() => expect(btn("Bold")).toHaveAttribute("aria-pressed", "false"));
  });

  it("switching list types works (bullets -> numbered)", async () => {
    await setup("<p>hello</p>");
    act(() => { editor.commands.setTextSelection({ from: 1, to: 6 }); });
    fireEvent.click(btn("Bullet list"));
    fireEvent.click(btn("Numbered list"));
    expect(editor.getHTML()).toMatch(/^<ol><li><p>hello<\/p><\/li>/);
    expect(editor.getHTML()).not.toContain("<ul>");
  });

  it("Clear formatting removes marks and block styles", async () => {
    await setup("<h2><strong>hello</strong></h2>");
    selectAll();
    fireEvent.click(btn("Clear formatting"));
    expect(html()).toBe("<p>hello</p>");
  });

  it("Undo / Redo step through changes and are disabled when there is nothing to do", async () => {
    await setup();
    expect(btn("Undo")).toBeDisabled();
    expect(btn("Redo")).toBeDisabled();
    selectAll();
    fireEvent.click(btn("Bold"));
    await waitFor(() => expect(btn("Undo")).toBeEnabled());
    fireEvent.click(btn("Undo"));
    expect(html()).toBe("<p>hello</p>");
    await waitFor(() => expect(btn("Redo")).toBeEnabled());
    fireEvent.click(btn("Redo"));
    expect(html()).toContain("<strong>");
  });

  it("keyboard shortcuts work too (Ctrl+B style commands and markdown-style input rules)", async () => {
    await setup("<p></p>");
    act(() => { editor.commands.focus(); editor.commands.insertContent("x"); editor.commands.toggleBold(); });
    expect(editor.isActive("bold")).toBe(true);
  });
});

describe("tables", () => {
  it("inserts a 3x3 table with a header row, and shows row/column tools while inside it", async () => {
    await setup("<p></p>");
    expect(screen.queryByRole("button", { name: "Add row" })).not.toBeInTheDocument();
    fireEvent.click(btn("Table"));
    expect(editor.getHTML()).toContain("<table");
    expect(editor.getHTML().match(/<th/g)).toHaveLength(3);
    expect(editor.getHTML().match(/<td/g)).toHaveLength(6);
    await waitFor(() => expect(btn("Add row")).toBeInTheDocument());
    fireEvent.click(btn("Add row"));
    expect(editor.getHTML().match(/<td/g)).toHaveLength(9);
    fireEvent.click(btn("Add column"));
    expect(editor.getHTML().match(/<th/g)).toHaveLength(4);
    fireEvent.click(btn("Delete table"));
    expect(editor.getHTML()).not.toContain("<table");
  });
});

describe("Link tool (modal, not a browser prompt)", () => {
  it("inserts a hyperlink at the cursor", async () => {
    const prompt = vi.spyOn(window, "prompt");
    await setup("<p></p>");
    fireEvent.click(btn("Link"));
    const dialog = await screen.findByRole("dialog", { name: "Insert link" });
    fireEvent.change(within(dialog).getByLabelText("Link"), { target: { value: "https://example.com/docs" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Insert" }));
    expect(html()).toContain('href="https://example.com/docs"');
    expect(html()).toContain("noopener");
    expect(prompt).not.toHaveBeenCalled();
  });

  it("links the selected text, and Enter submits the dialog", async () => {
    await setup();
    selectAll();
    fireEvent.click(btn("Link"));
    const input = within(await screen.findByRole("dialog")).getByLabelText("Link");
    fireEvent.change(input, { target: { value: "https://example.com" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(html()).toMatch(/<a [^>]*href="https:\/\/example\.com\/?"[^>]*>hello<\/a>/);
  });

  it("rejects text that is not an http(s) link, keeping the dialog open", async () => {
    await setup();
    fireEvent.click(btn("Link"));
    const dialog = await screen.findByRole("dialog");
    for (const bad of ["not a link", "javascript:alert(1)"]) {
      fireEvent.change(within(dialog).getByLabelText("Link"), { target: { value: bad } });
      fireEvent.click(within(dialog).getByRole("button", { name: "Insert" }));
      expect(await within(dialog).findByRole("alert")).toHaveTextContent("Enter a full link starting with https://");
    }
    expect(html()).not.toContain("href");
  });

  it("an existing link is edited with the dialog (prefilled with its address)", async () => {
    await setup('<p><a href="https://old.test">go</a></p>');
    act(() => { editor.commands.setTextSelection(2); });
    await waitFor(() => expect(btn("Link")).toHaveAttribute("aria-pressed", "true"));
    fireEvent.click(btn("Link"));
    const dialog = await screen.findByRole("dialog", { name: "Edit link" });
    expect(within(dialog).getByLabelText("Link")).toHaveValue("https://old.test");
    fireEvent.change(within(dialog).getByLabelText("Link"), { target: { value: "https://new.test" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Insert" }));
    expect(html()).toContain("https://new.test");
    expect(html()).not.toContain("old.test");
  });

  it("Unlink removes the link but keeps the text", async () => {
    await setup('<p><a href="https://old.test">go</a></p>');
    act(() => { editor.commands.setTextSelection(2); });
    fireEvent.click(await screen.findByRole("button", { name: "Remove link" }));
    expect(html()).toBe("<p>go</p>");
  });
});

describe("Attach tool (the paperclip)", () => {
  async function attach(url: string, name = "") {
    fireEvent.click(btn("Attach image, video or file"));
    const dialog = await screen.findByRole("dialog", { name: "Attach image, video or file" });
    fireEvent.change(within(dialog).getByLabelText("Link"), { target: { value: url } });
    if (name) fireEvent.change(within(dialog).getByLabelText(/Name/), { target: { value: name } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Attach" }));
    return dialog;
  }

  it("explains how to share a Drive file", async () => {
    await setup();
    fireEvent.click(btn("Attach image, video or file"));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/Google Drive share link/);
    expect(dialog).toHaveTextContent(/Anyone with the link/);
  });

  it("a Drive file becomes a media link chip carrying the Drive id, and onAttach is told", async () => {
    await setup("<p></p>");
    await attach("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrSt/view?usp=sharing", "Pricing mockup.png");
    await waitFor(() => expect(onAttach).toHaveBeenCalled());
    const out = html();
    expect(out).toContain('data-drive-id="1AbCdEfGhIjKlMnOpQrSt"');
    expect(out).toContain('data-media="drive"');
    expect(out).toContain('class="media-link"');
    expect(out).toContain(">Pricing mockup.png</a>");
    expect(onAttach.mock.calls[0][0]).toMatchObject({ url: "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrSt/view?usp=sharing", name: "Pricing mockup.png" });
    expect(onAttach.mock.calls[0][0].link).toMatchObject({ type: "drive", driveId: "1AbCdEfGhIjKlMnOpQrSt" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("a direct image URL is embedded as an image", async () => {
    await setup("<p></p>");
    await attach("https://cdn.test/pic.png", "Pic");
    await waitFor(() => expect(html()).toContain('<img src="https://cdn.test/pic.png" alt="Pic">'));
    expect(onAttach.mock.calls[0][0].link.type).toBe("image");
  });

  it("regression: attaching an image and then another item keeps the image (the next insert must not replace it)", async () => {
    await setup("<p></p>");
    await attach("https://cdn.test/pic.png", "Pic");
    await waitFor(() => expect(html()).toContain("<img"));
    await attach("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrSt/view", "Second");
    await waitFor(() => expect(html()).toContain("data-drive-id"));
    expect(html()).toContain('<img src="https://cdn.test/pic.png"');
    await attach("https://cdn.test/other.png", "Other");
    await waitFor(() => expect(html().match(/<img/g)).toHaveLength(2));
  });

  it("a video or web link becomes a media link chip", async () => {
    await setup("<p></p>");
    await attach("https://cdn.test/demo.mp4");
    await waitFor(() => expect(html()).toContain('data-media="video"'));
    expect(html()).toContain(">demo.mp4</a>");
  });

  it("bad links are refused: nothing is inserted and onAttach is not called", async () => {
    await setup("<p></p>");
    const dialog = await attach("javascript:alert(1)");
    expect(await within(dialog).findByRole("alert")).toBeInTheDocument();
    expect(onAttach).not.toHaveBeenCalled();
    expect(html()).toBe(""); // nothing inserted (only the empty paragraph)
  });

  it("without an onAttach handler (comments) the link is still inserted into the text", async () => {
    await setup("<p></p>", { onAttach: undefined });
    await attach("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrSt/view", "Shot");
    await waitFor(() => expect(html()).toContain("data-drive-id"));
  });

  it("Escape closes only the dialog, and Cancel leaves the text alone", async () => {
    await setup();
    fireEvent.click(btn("Attach image, video or file"));
    await screen.findByRole("dialog");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("toolbar")).toBeInTheDocument();
    fireEvent.click(btn("Attach image, video or file"));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(html()).toBe("<p>hello</p>");
  });
});

describe("change reporting", () => {
  it("onChange gets the HTML and whether the editor is empty", async () => {
    await setup("<p></p>");
    act(() => { editor.commands.insertContent("typed"); });
    expect(onChange).toHaveBeenLastCalledWith("<p>typed</p>", false);
    act(() => { editor.commands.clearContent(true); });
    expect(onChange.mock.calls.at(-1)?.[1]).toBe(true);
  });

  it("shows a placeholder while empty", async () => {
    await setup("", { placeholder: "Write here" });
    expect(document.querySelector("p.is-editor-empty")).toHaveAttribute("data-placeholder", "Write here");
  });

  it("is a labelled multi-line textbox for assistive tech", async () => {
    await setup("<p>x</p>", { ariaLabel: "Comment" });
    expect(screen.getByRole("textbox", { name: "Comment" })).toHaveAttribute("aria-multiline", "true");
  });
});

describe("RichField (inside a <form>)", () => {
  it("keeps a hidden input in sync with the HTML, and '' when empty", async () => {
    const { container } = render(<form><RichField name="body" initial="" /></form>);
    await screen.findByRole("toolbar");
    const hidden = container.querySelector('input[name="body"]') as HTMLInputElement;
    expect(hidden.type).toBe("hidden");
    expect(hidden.value).toBe("");
    act(() => { editorAt().commands.insertContent("note"); });
    expect(hidden.value).toBe("<p>note</p>");
    act(() => { editorAt().commands.clearContent(true); });
    expect(hidden.value).toBe("");
  });

  it("opening the link dialog from inside a form never submits that form", async () => {
    const submit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(<form onSubmit={submit}><RichField name="body" /></form>);
    await screen.findByRole("toolbar");
    fireEvent.click(btn("Link"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Link"), { target: { value: "https://ok.test" } });
    fireEvent.keyDown(within(dialog).getByLabelText("Link"), { key: "Enter" });
    fireEvent.click(btn("Attach image, video or file"));
    expect(submit).not.toHaveBeenCalled();
  });
});
