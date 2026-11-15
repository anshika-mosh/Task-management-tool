"use client";
import { useFormAction } from "@/lib/use-form-action";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addComment, addLinkAttachment, addProgress, deleteAttachment, deleteComment, deleteTicket, updateTicket } from "@/lib/actions";
import type { Attachment } from "@/lib/types";
import { formatSize, timeAgo } from "@/lib/format";
import { uploadFiles } from "@/components/uploader";
import { driveThumb } from "@/lib/links";
import type { Editor } from "@tiptap/react";
import RichEditor, { RichField, type AttachInfo } from "@/components/RichEditor";
import RichContent from "@/components/RichContent";
import Lightbox, { type LightboxItem } from "@/components/Lightbox";
import { useConfirm } from "@/components/ConfirmProvider";
import { Icon } from "@/components/icons";

type Opt = { id: string | number; label: string };

export function TitleEditor({ id, value }: { id: number; value: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      className="ticket-title"
      value={v}
      maxLength={250}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v.trim() && v !== value && updateTicket(id, "title", v)}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setV(value); (e.target as HTMLInputElement).blur(); } }}
      aria-label="Ticket summary"
    />
  );
}

/**
 * Description with a Word-style editor. `html` is the sanitized description (server-side).
 * The paperclip icon in the editor's toolbar is the only way to attach images/videos/files:
 * it inserts the link into the text AND registers it as a ticket attachment.
 */
export function DescriptionEditor({ id, html }: { id: number; html: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(html);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const baseline = useRef("");

  // The editor re-serialises content (and adds a blank paragraph after tables/dividers), so "changed" is
  // measured against what the editor itself produced when it opened, never against the stored string.
  const blank = (h: string) => h.replace(/(<p><\/p>)+$/, "");
  const ready = (e: Editor) => { baseline.current = blank(e.getHTML()); };
  const open = () => { setDraft(html); setDirty(false); setError(""); setEditing(true); };

  async function attach({ url, name }: AttachInfo) {
    const fd = new FormData();
    fd.set("url", url);
    fd.set("name", name);
    const res = await addLinkAttachment(id, undefined, fd);
    if (res?.error) setError(res.error);
    else router.refresh();
  }

  if (!editing)
    return (
      <div className="desc-wrap">
        <div className={"desc" + (html ? "" : " desc-empty")} onClick={(e) => { if (!(e.target as HTMLElement).closest("a, img, input")) open(); }}>
          {html ? <RichContent html={html} /> : <span className="muted">Add a description…</span>}
        </div>
        <button type="button" className="btn ghost sm desc-edit" onClick={open} aria-label="Edit description"><Icon name="edit" size={14} /> Edit</button>
      </div>
    );

  return (
    <div>
      <RichEditor value={html} autoFocus placeholder="Describe the ticket… use the toolbar for lists, code, tables and attachments" ariaLabel="Description" onChange={(h, empty) => { setDraft(empty ? "" : h); setDirty(blank(h) !== baseline.current); }} onReady={ready} onAttach={attach} />
      {error && <p className="err" role="alert">{error}</p>}
      <div className="row" style={{ marginTop: 10 }}>
        <button type="button" className="btn primary sm" disabled={pending || !dirty} onClick={() => start(async () => { await updateTicket(id, "description", draft); setEditing(false); })}>Save</button>
        <button type="button" className="btn ghost sm" onClick={() => setEditing(false)}>Cancel</button>
      </div>
    </div>
  );
}

export function FieldSelect({ id, field, value, options, type = "select" }: { id: number; field: "status" | "priority" | "type" | "assignee_id" | "due_date" | "sprint_id"; value: string | number | null; options?: Opt[]; type?: "select" | "date" }) {
  const [pending, start] = useTransition();
  const [v, setV] = useState(value ?? "");
  useEffect(() => setV(value ?? ""), [value]);
  const change = (nv: string) => { setV(nv); start(() => updateTicket(id, field, nv === "" ? null : nv)); };
  if (type === "date") return <input type="date" value={String(v)} onChange={(e) => change(e.target.value)} disabled={pending} />;
  return (
    <select value={String(v)} onChange={(e) => change(e.target.value)} disabled={pending}>
      {options!.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  );
}

export function AssignToMe({ id, meId }: { id: number; meId: number }) {
  const [pending, start] = useTransition();
  return <button className="btn sm" disabled={pending} onClick={() => start(() => updateTicket(id, "assignee_id", meId))}>Assign to me</button>;
}

export function DeleteTicket({ id, ticketKey }: { id: number; ticketKey: string }) {
  const [pending, start] = useTransition();
  const confirm = useConfirm();
  return (
    <button
      className="btn danger sm"
      disabled={pending}
      onClick={async () => {
        if (await confirm({ title: `Delete ${ticketKey}?`, message: "The ticket, its comments, history and attachments will be permanently deleted. This cannot be undone.", confirmLabel: "Delete ticket", danger: true })) start(() => deleteTicket(id));
      }}
    >
      Delete
    </button>
  );
}

export function DeleteComment({ id }: { id: number }) {
  const [pending, start] = useTransition();
  const confirm = useConfirm();
  return (
    <button
      className="btn ghost sm"
      disabled={pending}
      onClick={async () => {
        if (await confirm({ title: "Delete this entry?", message: "This comment or progress update will be removed.", confirmLabel: "Delete", danger: true })) start(() => deleteComment(id));
      }}
    >
      Delete
    </button>
  );
}

export function Tabs({ tabs }: { tabs: { id: string; label: string; content: React.ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0].id);
  return (
    <div>
      <div className="tabs" role="tablist">
        {tabs.map((t) => <button key={t.id} role="tab" className={"tab" + (active === t.id ? " active" : "")} onClick={() => setActive(t.id)}>{t.label}</button>)}
      </div>
      {tabs.find((t) => t.id === active)?.content}
    </div>
  );
}

export function CommentForm({ ticketId }: { ticketId: number }) {
  const { state, onSubmit, pending } = useFormAction(addComment.bind(null, ticketId));
  const [resetKey, setResetKey] = useState(0);
  useEffect(() => { if (state?.ok) setResetKey((k) => k + 1); }, [state]); // clears the editor after posting
  return (
    <form onSubmit={onSubmit}>
      <RichField key={resetKey} name="body" placeholder="Add a comment…" ariaLabel="Comment" />
      {state?.error && <p className="err">{state.error}</p>}
      <button className="btn primary sm" style={{ marginTop: 10 }} disabled={pending}>{pending ? "Saving…" : "Comment"}</button>
    </form>
  );
}

export function ProgressForm({ ticketId, current }: { ticketId: number; current: number }) {
  const { state, onSubmit, pending } = useFormAction(addProgress.bind(null, ticketId));
  const [resetKey, setResetKey] = useState(0);
  const [pct, setPct] = useState(current);
  const hours = useRef<HTMLInputElement>(null);
  useEffect(() => setPct(current), [current]);
  useEffect(() => {
    if (state?.ok) {
      setResetKey((k) => k + 1);
      if (hours.current) hours.current.value = "";
    }
  }, [state]);
  return (
    <form onSubmit={onSubmit}>
      <RichField key={resetKey} name="body" placeholder="What did you get done? Blockers? Next steps?" ariaLabel="Progress update" />
      <div className="seg" style={{ marginTop: 10 }}>
        <div>
          <label style={{ marginTop: 0 }}>% complete: <b>{pct}%</b></label>
          <input type="range" name="progress" min={0} max={100} step={5} value={pct} onChange={(e) => setPct(Number(e.target.value))} style={{ padding: 0 }} />
        </div>
        <div>
          <label style={{ marginTop: 0 }}>Hours spent</label>
          <input ref={hours} type="number" name="hours" min={0} step={0.25} placeholder="0" />
        </div>
        <div style={{ alignSelf: "end" }}><button className="btn primary" style={{ width: "100%", justifyContent: "center" }} disabled={pending}>{pending ? "Posting…" : "Post update"}</button></div>
      </div>
      {state?.error && <p className="err">{state.error}</p>}
      {state?.ok && <p className="okmsg">{state.ok}</p>}
    </form>
  );
}

/* ------------------------------ attachments ------------------------------ */

type Media = "drive" | "image" | "video" | "pdf" | "file" | "web";

function mediaOf(a: Attachment): Media {
  if (a.kind === "link") return a.link_type ?? "web";
  if (a.mime.startsWith("image/")) return "image";
  if (a.mime.startsWith("video/")) return "video";
  if (a.mime === "application/pdf") return "pdf";
  return "file";
}
const srcOf = (a: Attachment) => (a.kind === "link" ? a.url! : `/api/files/${a.id}`);
const previewable = (m: Media) => m === "drive" || m === "image" || m === "video";
const ICON: Record<Media, string> = { drive: "🖼️", image: "🖼️", video: "🎬", pdf: "📕", file: "📄", web: "🔗" };

function Thumb({ a, media }: { a: Attachment; media: Media }) {
  const [failed, setFailed] = useState(false);
  if (media === "drive" && a.drive_id && !failed)
    return /* eslint-disable-next-line @next/next/no-img-element */ <img src={driveThumb(a.drive_id)} alt={a.filename} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
  if (media === "image" && !failed)
    return /* eslint-disable-next-line @next/next/no-img-element */ <img src={srcOf(a)} alt={a.filename} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
  if (media === "video" && !failed) return <video src={srcOf(a) + "#t=0.5"} preload="metadata" muted onError={() => setFailed(true)} />;
  return <span>{ICON[media]}</span>;
}

function toLightbox(a: Attachment, media: Media): LightboxItem | null {
  if (media === "drive" && a.drive_id) return { kind: "drive", driveId: a.drive_id, title: a.filename, openUrl: a.url! };
  if (media === "image") return { kind: "image", src: srcOf(a), title: a.filename };
  if (media === "video") return { kind: "video", src: srcOf(a), title: a.filename };
  return null;
}

/** Gallery of the ticket's attachments. New ones are added with the paperclip icon in the description editor. */
export function Attachments({ ticketId, items, meId, isAdmin, allowUploads }: { ticketId: number; items: Attachment[]; meId: number; isAdmin: boolean; allowUploads: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [pct, setPct] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState<LightboxItem | null>(null);
  const [, start] = useTransition();

  async function upload(files: File[]) {
    if (!allowUploads || !files.length) return;
    setErr(""); setPct(0);
    try { await uploadFiles(ticketId, files, setPct); router.refresh(); } catch (e) { setErr((e as Error).message); }
    setPct(null);
  }

  // Paste screenshots straight into the ticket (only when local uploads are enabled).
  useEffect(() => {
    if (!allowUploads) return;
    const onPaste = (e: ClipboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (/^(INPUT|TEXTAREA)$/.test(el.tagName) || el.isContentEditable) && !(e.clipboardData?.files.length)) return;
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) { e.preventDefault(); upload(files); }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  });

  return (
    <div>
      {allowUploads && (
        <div
          className={"dropzone" + (over ? " over" : "")}
          onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); upload(Array.from(e.dataTransfer.files)); }}
        >
          📎 Drop files here, <u>browse</u>, or paste a screenshot
          <input ref={input} type="file" multiple hidden onChange={(e) => { upload(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
        </div>
      )}
      {pct !== null && <div className="upload-row"><div className="progress"><div style={{ width: `${pct}%` }} /></div>Uploading… {pct}%</div>}
      {err && <p className="err">{err}</p>}
      {items.length > 0 && (
        <div className="att-grid">
          {items.map((a) => {
            const media = mediaOf(a);
            const canDelete = a.user_id === meId || isAdmin;
            return (
              <div className="att" key={a.id}>
                <button className="thumb" onClick={() => { const item = toLightbox(a, media); if (item && previewable(media)) setPreview(item); else window.open(srcOf(a), "_blank", "noopener"); }} aria-label={`Open ${a.filename}`}>
                  <Thumb a={a} media={media} />
                </button>
                <div className="info">
                  <a href={a.kind === "link" ? a.url! : `${srcOf(a)}?download=1`} {...(a.kind === "link" ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="name" title={a.filename}>{a.filename}</a>
                  <span className="muted">
                    {a.kind === "link" ? (media === "drive" ? "Google Drive" : "Link") : formatSize(a.size)} · {a.user_name} · {timeAgo(a.created_at)}
                  </span>
                </div>
                {canDelete && (
                  <button
                    className="x"
                    title="Remove attachment"
                    onClick={async () => {
                      if (await confirm({ title: "Remove attachment?", message: <>“{a.filename}” will be removed from this ticket.</>, confirmLabel: "Remove", danger: true })) start(() => deleteAttachment(a.id));
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {preview && <Lightbox item={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
