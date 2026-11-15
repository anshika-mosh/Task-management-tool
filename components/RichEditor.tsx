"use client";
import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { Icon, type IconName } from "./icons";
import LinkDialog, { type LinkDialogResult } from "./LinkDialog";
import type { ParsedLink } from "@/lib/links";

export type AttachInfo = { url: string; name: string; link: ParsedLink };

/** Hyperlinks that can also carry "media" info, so images/videos/Drive files open in the viewer when clicked. */
const MediaLink = Link.extend({
  addAttributes() {
    const attr = (name: string) => ({
      default: null,
      parseHTML: (el: HTMLElement) => el.getAttribute(name),
      renderHTML: (attrs: Record<string, unknown>) => (attrs[name] ? { [name]: attrs[name] } : {}),
    });
    return { ...this.parent?.(), class: attr("class"), "data-media": attr("data-media"), "data-drive-id": attr("data-drive-id") };
  },
});

export const richExtensions = (placeholder?: string) => [
  StarterKit.configure({ link: false }), // headings, lists, quote, code, code block, divider, bold/italic/underline/strike, history
  MediaLink.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" } }),
  Image.configure({ inline: false }),
  Highlight,
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  Placeholder.configure({ placeholder: placeholder ?? "Write something…" }),
];

type Props = {
  /** Initial HTML (already sanitized). */
  value: string;
  onChange?: (html: string, isEmpty: boolean) => void;
  placeholder?: string;
  autoFocus?: boolean;
  ariaLabel?: string;
  /** Called after an image/video/file link is inserted with the attach icon (e.g. to also register it as a ticket attachment). */
  onAttach?: (a: AttachInfo) => void | Promise<void>;
  /** Gives the parent the editor instance (used by tests and for programmatic reset). */
  onReady?: (editor: Editor) => void;
};

function Btn({ label, icon, text, active, disabled, onClick }: { label: string; icon?: IconName; text?: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={"rte-btn" + (active ? " on" : "")}
      aria-label={label}
      title={label}
      aria-pressed={active ?? undefined}
      disabled={disabled}
      // keep the text selection while using the toolbar
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {icon ? <Icon name={icon} /> : <span className="rte-text">{text}</span>}
    </button>
  );
}
const IDLE = {
  bold: false, italic: false, underline: false, strike: false, highlight: false, h1: false, h2: false, h3: false, bullets: false, numbers: false, tasks: false,
  quote: false, code: false, codeblock: false, link: false, table: false, left: false, center: false, right: false, canUndo: false, canRedo: false,
};
const Sep = () => <span className="rte-sep" role="separator" />;

export default function RichEditor({ value, onChange, placeholder, autoFocus, ariaLabel = "Rich text editor", onAttach, onReady }: Props) {
  const [dialog, setDialog] = useState<"link" | "attach" | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    extensions: richExtensions(placeholder),
    content: value,
    autofocus: autoFocus ? "end" : false,
    immediatelyRender: false, // render on the client only (avoids hydration mismatches)
    editorProps: { attributes: { class: "rte-body", role: "textbox", "aria-multiline": "true", "aria-label": ariaLabel } },
    onUpdate: ({ editor }) => onChangeRef.current?.(editor.getHTML(), editor.isEmpty),
  });

  // Once per editor instance (the callback is usually a new function on every parent render).
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  useEffect(() => {
    if (editor) readyRef.current?.(editor);
  }, [editor]);

  const live = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive("bold"), italic: e.isActive("italic"), underline: e.isActive("underline"), strike: e.isActive("strike"), highlight: e.isActive("highlight"),
            h1: e.isActive("heading", { level: 1 }), h2: e.isActive("heading", { level: 2 }), h3: e.isActive("heading", { level: 3 }),
            bullets: e.isActive("bulletList"), numbers: e.isActive("orderedList"), tasks: e.isActive("taskList"),
            quote: e.isActive("blockquote"), code: e.isActive("code"), codeblock: e.isActive("codeBlock"), link: e.isActive("link"), table: e.isActive("table"),
            left: e.isActive({ textAlign: "left" }), center: e.isActive({ textAlign: "center" }), right: e.isActive({ textAlign: "right" }),
            canUndo: e.can().undo(), canRedo: e.can().redo(),
          }
        : null,
  });
  const s = live ?? IDLE;

  if (!editor) return <div className="rte rte-loading" aria-busy="true" />;
  const c = () => editor.chain().focus();

  function insertLink({ link, name }: LinkDialogResult) {
    if (!editor) return;
    if (dialog === "link") {
      const sel = editor.state.selection;
      if (sel.empty && !editor.isActive("link")) {
        editor.chain().focus().insertContent({ type: "text", text: name === link.defaultName ? link.url : name, marks: [{ type: "link", attrs: { href: link.url } }] }).run();
      } else editor.chain().focus().extendMarkRange("link").setLink({ href: link.url }).run();
    } else {
      if (link.type === "image") editor.chain().focus().insertContent([{ type: "image", attrs: { src: link.url, alt: name } }, { type: "paragraph" }]).run(); // paragraph after: the cursor moves past the image so the next insert cannot replace it
      else {
        editor
          .chain()
          .focus()
          .insertContent([
            { type: "text", text: name, marks: [{ type: "link", attrs: { href: link.url, class: "media-link", "data-media": link.type, "data-drive-id": link.driveId } }] },
            { type: "text", text: " " },
          ])
          .run();
      }
      void onAttach?.({ url: link.url, name, link });
    }
    setDialog(null);
  }

  return (
    <div className="rte">
      <div className="rte-toolbar" role="toolbar" aria-label="Formatting">
        <Btn label="Undo" icon="undo" disabled={!s.canUndo} onClick={() => c().undo().run()} />
        <Btn label="Redo" icon="redo" disabled={!s.canRedo} onClick={() => c().redo().run()} />
        <Sep />
        <Btn label="Heading 1" text="H1" active={s.h1} onClick={() => c().toggleHeading({ level: 1 }).run()} />
        <Btn label="Heading 2" text="H2" active={s.h2} onClick={() => c().toggleHeading({ level: 2 }).run()} />
        <Btn label="Heading 3" text="H3" active={s.h3} onClick={() => c().toggleHeading({ level: 3 }).run()} />
        <Sep />
        <Btn label="Bold" icon="bold" active={s.bold} onClick={() => c().toggleBold().run()} />
        <Btn label="Italic" icon="italic" active={s.italic} onClick={() => c().toggleItalic().run()} />
        <Btn label="Underline" icon="underline" active={s.underline} onClick={() => c().toggleUnderline().run()} />
        <Btn label="Strikethrough" icon="strike" active={s.strike} onClick={() => c().toggleStrike().run()} />
        <Btn label="Highlight" icon="highlight" active={s.highlight} onClick={() => c().toggleHighlight().run()} />
        <Sep />
        <Btn label="Bullet list" icon="bullets" active={s.bullets} onClick={() => c().toggleBulletList().run()} />
        <Btn label="Numbered list" icon="numbers" active={s.numbers} onClick={() => c().toggleOrderedList().run()} />
        <Btn label="Checklist" icon="checklist" active={s.tasks} onClick={() => c().toggleTaskList().run()} />
        <Sep />
        <Btn label="Quote" icon="quote" active={s.quote} onClick={() => c().toggleBlockquote().run()} />
        <Btn label="Code" icon="code" active={s.code} onClick={() => c().toggleCode().run()} />
        <Btn label="Code block" icon="codeblock" active={s.codeblock} onClick={() => c().toggleCodeBlock().run()} />
        <Btn label="Divider" icon="divider" onClick={() => c().setHorizontalRule().run()} />
        <Sep />
        <Btn label="Align left" icon="alignLeft" active={s.left} onClick={() => c().setTextAlign("left").run()} />
        <Btn label="Align center" icon="alignCenter" active={s.center} onClick={() => c().setTextAlign("center").run()} />
        <Btn label="Align right" icon="alignRight" active={s.right} onClick={() => c().setTextAlign("right").run()} />
        <Sep />
        <Btn label="Table" icon="table" active={s.table} onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
        {s.table && (
          <>
            <Btn label="Add column" text="+Col" onClick={() => c().addColumnAfter().run()} />
            <Btn label="Add row" text="+Row" onClick={() => c().addRowAfter().run()} />
            <Btn label="Delete table" text="Del" onClick={() => c().deleteTable().run()} />
          </>
        )}
        <Btn label="Link" icon="link" active={s.link} onClick={() => { setLinkUrl(editor.getAttributes("link").href ?? ""); setDialog("link"); }} />
        {s.link && <Btn label="Remove link" text="Unlink" onClick={() => c().extendMarkRange("link").unsetLink().run()} />}
        <Btn label="Attach image, video or file" icon="attach" onClick={() => { setLinkUrl(""); setDialog("attach"); }} />
        <Sep />
        <Btn label="Clear formatting" icon="clear" onClick={() => c().unsetAllMarks().clearNodes().run()} />
      </div>
      <EditorContent editor={editor} />
      {dialog && <LinkDialog mode={dialog} initialUrl={linkUrl} onSubmit={insertLink} onClose={() => setDialog(null)} />}
    </div>
  );
}

/** A RichEditor that submits its HTML with a surrounding <form> as a hidden field. */
export function RichField({ name, initial = "", ...props }: Omit<Props, "value" | "onChange"> & { name: string; initial?: string }) {
  const [html, setHtml] = useState(initial);
  return (
    <>
      <RichEditor {...props} value={initial} onChange={(h, empty) => setHtml(empty ? "" : h)} />
      <input type="hidden" name={name} value={html} readOnly />
    </>
  );
}
