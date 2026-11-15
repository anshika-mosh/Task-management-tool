// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Modal from "@/components/Modal";
import { ConfirmProvider, useConfirm } from "@/components/ConfirmProvider";
import RichContent from "@/components/RichContent";
import Lightbox from "@/components/Lightbox";
import LinkDialog from "@/components/LinkDialog";
import { Icon } from "@/components/icons";

beforeEach(() => vi.clearAllMocks());

describe("Modal", () => {
  it("renders in <body> (outside any form), as a labelled dialog that takes focus", async () => {
    const { container } = render(<form><Modal onClose={() => {}} label="Example"><button>inside</button></Modal></form>);
    const dialog = await screen.findByRole("dialog", { name: "Example" });
    expect(container.querySelector("form")).not.toContainElement(dialog); // not nested in the form
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(document.activeElement).toBe(dialog);
  });

  it("leaves focus alone when a field inside already took it (autoFocus)", async () => {
    render(<Modal onClose={() => {}}><input aria-label="name" autoFocus /></Modal>);
    await screen.findByRole("dialog");
    expect(document.activeElement).toBe(screen.getByLabelText("name"));
  });

  it("with stacked dialogs, Escape closes only the top one", async () => {
    const closeA = vi.fn();
    const closeB = vi.fn();
    render(<><Modal onClose={closeA} label="A">a</Modal><Modal onClose={closeB} label="B">b</Modal></>);
    await screen.findByRole("dialog", { name: "B" });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(closeB).toHaveBeenCalledTimes(1);
    expect(closeA).not.toHaveBeenCalled();
  });

  it("clicking the backdrop closes it; clicking inside does not", async () => {
    const onClose = vi.fn();
    render(<Modal onClose={onClose}><button>inside</button></Modal>);
    fireEvent.mouseDown(await screen.findByText("inside"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByRole("dialog").parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("an alertdialog role is available for confirmations", async () => {
    render(<Modal onClose={() => {}} role="alertdialog">x</Modal>);
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
  });
});

describe("ConfirmProvider / useConfirm (replaces window.confirm)", () => {
  function Harness({ options }: { options?: Partial<Parameters<ReturnType<typeof useConfirm>>[0]> }) {
    const confirm = useConfirm();
    const [answer, setAnswer] = useState("none");
    return (
      <>
        <button onClick={async () => setAnswer(String(await confirm({ message: "Really?", ...options })))}>ask</button>
        <output>{answer}</output>
      </>
    );
  }
  const renderIt = (options?: Parameters<typeof Harness>[0]["options"]) => render(<ConfirmProvider><Harness options={options} /></ConfirmProvider>);

  it("shows the question in an in-app dialog and resolves true on confirm", async () => {
    const native = vi.spyOn(window, "confirm");
    renderIt({ title: "Delete it?", message: "It will be gone.", confirmLabel: "Yes, delete" });
    fireEvent.click(screen.getByText("ask"));
    const dialog = await screen.findByRole("alertdialog", { name: "Delete it?" });
    expect(dialog).toHaveTextContent("It will be gone.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("true"));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(native).not.toHaveBeenCalled();
  });

  it.each([
    ["Cancel button", () => fireEvent.click(screen.getByRole("button", { name: "Cancel" }))],
    ["Escape", () => fireEvent.keyDown(document, { key: "Escape" })],
    ["backdrop click", () => fireEvent.mouseDown(screen.getByRole("alertdialog").parentElement!)],
  ])("resolves false on %s", async (_name, dismiss) => {
    renderIt();
    fireEvent.click(screen.getByText("ask"));
    await screen.findByRole("alertdialog");
    dismiss();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("false"));
  });

  it("danger confirmations use the destructive button style, with custom labels", async () => {
    renderIt({ danger: true, confirmLabel: "Delete forever", cancelLabel: "Keep it" });
    fireEvent.click(screen.getByText("ask"));
    expect(await screen.findByRole("button", { name: "Delete forever" })).toHaveClass("danger-solid");
    expect(screen.getByRole("button", { name: "Keep it" })).toBeInTheDocument();
  });

  it("has a default title and focuses the confirm button", async () => {
    renderIt();
    fireEvent.click(screen.getByText("ask"));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Are you sure?");
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Confirm" }));
  });

  it("throws a clear error if used outside the provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Harness />)).toThrow(/inside <ConfirmProvider>/);
    spy.mockRestore();
  });
});

describe("RichContent (formatted text with a media viewer)", () => {
  const drive = '<p><a href="https://drive.google.com/file/d/ABCDEFGHIJKL/view" class="media-link" data-media="drive" data-drive-id="ABCDEFGHIJKL">Mockup.png</a></p>';

  it("renders the formatted HTML", () => {
    render(<RichContent html="<h2>Title</h2><ul><li><p>item</p></li></ul><pre><code>x()</code></pre>" />);
    expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument();
    expect(screen.getByText("item")).toBeInTheDocument();
    expect(screen.getByText("x()")).toBeInTheDocument();
  });

  it("clicking a Drive file opens it in the viewer instead of navigating away", () => {
    const { container } = render(<RichContent html={drive} />);
    const ev = fireEvent.click(screen.getByRole("link", { name: "Mockup.png" }));
    expect(ev).toBe(false); // default navigation was prevented
    expect(container.querySelector("iframe")).toHaveAttribute("src", "https://drive.google.com/file/d/ABCDEFGHIJKL/preview");
    expect(screen.getByRole("link", { name: "Open in Drive ↗" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("opens image and video media links and inline images in the viewer", () => {
    const { container } = render(
      <RichContent html='<p><a href="https://cdn.test/v.mp4" data-media="video">clip</a> <a href="https://cdn.test/p.png" data-media="image">pic</a> <img src="https://cdn.test/inline.png" alt="inline"></p>' />,
    );
    fireEvent.click(screen.getByRole("link", { name: "clip" }));
    expect(container.querySelector(".lightbox video")).toHaveAttribute("src", "https://cdn.test/v.mp4");
    fireEvent.click(container.querySelector(".lightbox")!);
    fireEvent.click(screen.getByRole("link", { name: "pic" }));
    expect(container.querySelector(".lightbox img")).toHaveAttribute("src", "https://cdn.test/p.png");
    fireEvent.click(container.querySelector(".lightbox")!);
    fireEvent.click(screen.getByAltText("inline"));
    expect(container.querySelector(".lightbox img")).toHaveAttribute("src", "https://cdn.test/inline.png");
  });

  it("ordinary links keep their normal behaviour", () => {
    const { container } = render(<RichContent html='<p><a href="https://example.com" target="_blank">site</a></p>' />);
    const ev = fireEvent.click(screen.getByRole("link", { name: "site" }));
    expect(ev).toBe(true);
    expect(container.querySelector(".lightbox")).toBeNull();
  });
});

describe("Lightbox", () => {
  it("closes on backdrop click, the × button and Escape, but not when clicking the media", () => {
    const onClose = vi.fn();
    const { container } = render(<Lightbox item={{ kind: "image", src: "https://x.test/a.png", title: "a" }} onClose={onClose} />);
    fireEvent.click(container.querySelector("img")!);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(container.querySelector(".lightbox")!);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});

describe("LinkDialog", () => {
  it("attach mode asks for a link and an optional name, with a default name from the link", () => {
    const onSubmit = vi.fn();
    render(<LinkDialog mode="attach" onSubmit={onSubmit} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Link"), { target: { value: "https://drive.google.com/file/d/ABCDEFGHIJKL/view" } });
    fireEvent.click(screen.getByRole("button", { name: "Attach" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ name: "Drive file", link: { type: "drive", driveId: "ABCDEFGHIJKL" } });
  });

  it("link mode has no name field and a different title", () => {
    render(<LinkDialog mode="link" onSubmit={() => {}} onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Insert link" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Name/)).not.toBeInTheDocument();
  });

  it("clears the error as soon as you edit the link", () => {
    render(<LinkDialog mode="link" onSubmit={() => {}} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Insert" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Link"), { target: { value: "h" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("Icon", () => {
  it("renders a decorative SVG", () => {
    const { container } = render(<Icon name="bold" />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg.querySelector("path")).toHaveAttribute("d");
  });
});
