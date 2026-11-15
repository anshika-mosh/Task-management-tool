"use client";
import { useFormAction } from "@/lib/use-form-action";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addComment, addLinkAttachment, addProgress, deleteAttachment, deleteComment, deleteTicket, updateTicket } from "@/lib/actions";
import type { Attachment } from "@/lib/types";
import { formatSize, timeAgo } from "@/lib/format";
import { uploadFiles } from "@/components/uploader";
import { drivePreview, driveThumb } from "@/lib/links";

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

export function DescriptionEditor({ id, value }: { id: number; value: string }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);
  const [pending, start] = useTransition();
  useEffect(() => setV(value), [value]);
  if (!editing)
    return (
      <div className="desc" onClick={() => setEditing(true)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setEditing(true)}>
        {value || <span className="muted">Add a description…</span>}
      </div>
    );
  return (
    <div>
      <textarea autoFocus rows={8} value={v} onChange={(e) => setV(e.target.value)} />
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn primary sm" disabled={pending} onClick={() => start(async () => { await updateTicket(id, "description", v); setEditing(false); })}>Save</button>
        <button className="btn ghost sm" onClick={() => { setV(value); setEditing(false); }}>Cancel</button>
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
  return (
    <button className="btn danger sm" disabled={pending} onClick={() => confirm(`Delete ${ticketKey} and all its attachments? This cannot be undone.`) && start(() => deleteTicket(id))}>
      Delete
    </button>
  );
}

export function DeleteComment({ id }: { id: number }) {
  const [pending, start] = useTransition();
  return <button className="btn ghost sm" disabled={pending} onClick={() => confirm("Delete this entry?") && start(() => deleteComment(id))}>Delete</button>;
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
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return (
    <form onSubmit={onSubmit} ref={ref}>
      <textarea name="body" rows={3} placeholder="Add a comment…" required />
      {state?.error && <p className="err">{state.error}</p>}
      <button className="btn primary sm" style={{ marginTop: 8 }} disabled={pending}>{pending ? "Saving…" : "Comment"}</button>
    </form>
  );
}

export function ProgressForm({ ticketId, current }: { ticketId: number; current: number }) {
  const { state, onSubmit, pending } = useFormAction(addProgress.bind(null, ticketId));
  const ref = useRef<HTMLFormElement>(null);
  const [pct, setPct] = useState(current);
  useEffect(() => setPct(current), [current]);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return (
    <form onSubmit={onSubmit} ref={ref}>
      <textarea name="body" rows={3} placeholder="What did you get done? Blockers? Next steps?" required />
      <div className="seg" style={{ marginTop: 8 }}>
        <div>
          <label style={{ marginTop: 0 }}>% complete: <b>{pct}%</b></label>
          <input type="range" name="progress" min={0} max={100} step={5} value={pct} onChange={(e) => setPct(Number(e.target.value))} style={{ padding: 0 }} />
        </div>
        <div>
          <label style={{ marginTop: 0 }}>Hours spent</label>
          <input type="number" name="hours" min={0} step={0.25} placeholder="0" />
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

export function AddLink({ ticketId }: { ticketId: number }) {
  const { state, onSubmit, pending } = useFormAction(addLinkAttachment.bind(null, ticketId));
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return (
    <form onSubmit={onSubmit} ref={ref}>
      <div className="link-form">
        <input name="url" type="url" required placeholder="Paste a Google Drive link (image, video, file) or any URL…" aria-label="Link URL" />
        <input name="name" placeholder="Name (optional)" aria-label="Link name" />
        <button className="btn primary" disabled={pending}>{pending ? "Attaching…" : "🔗 Attach link"}</button>
      </div>
      <p className="muted small" style={{ margin: "6px 0 0" }}>In Drive: Share → General access → <b>Anyone with the link</b> → Copy link, so teammates can view it.</p>
      {state?.error && <p className="err">{state.error}</p>}
    </form>
  );
}

export function Attachments({ ticketId, items, meId, isAdmin, allowUploads }: { ticketId: number; items: Attachment[]; meId: number; isAdmin: boolean; allowUploads: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [pct, setPct] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState<Attachment | null>(null);
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
      if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName) && !(e.clipboardData?.files.length)) return;
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) { e.preventDefault(); upload(files); }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  });

  useEffect(() => {
    if (!preview) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setPreview(null);
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [preview]);

  const pm = preview ? mediaOf(preview) : null;

  return (
    <div>
      <AddLink ticketId={ticketId} />
      {allowUploads && (
        <div
          className={"dropzone" + (over ? " over" : "")}
          style={{ marginTop: 12 }}
          onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); upload(Array.from(e.dataTransfer.files)); }}
        >
          📎 Or drop files here, <u>browse</u>, or paste a screenshot
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
                <button className="thumb" onClick={() => (previewable(media) ? setPreview(a) : window.open(srcOf(a), "_blank", "noopener"))} aria-label={`Open ${a.filename}`}>
                  <Thumb a={a} media={media} />
                </button>
                <div className="info">
                  <a href={a.kind === "link" ? a.url! : `${srcOf(a)}?download=1`} {...(a.kind === "link" ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="name" title={a.filename}>{a.filename}</a>
                  <span className="muted">
                    {a.kind === "link" ? (media === "drive" ? "Google Drive" : "Link") : formatSize(a.size)} · {a.user_name} · {timeAgo(a.created_at)}
                  </span>
                </div>
                {canDelete && <button className="x" title="Remove attachment" onClick={() => confirm(`Remove ${a.filename}?`) && start(() => deleteAttachment(a.id))}>×</button>}
              </div>
            );
          })}
        </div>
      )}
      {preview && pm && (
        <div className="lightbox" onClick={() => setPreview(null)}>
          <button className="close" aria-label="Close">×</button>
          {pm === "drive" && preview.drive_id ? (
            <>
              <iframe className="drive-frame" src={drivePreview(preview.drive_id)} allow="autoplay; fullscreen" allowFullScreen title={preview.filename} onClick={(e) => e.stopPropagation()} />
              <a className="open-drive" href={preview.url!} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>Open in Drive ↗</a>
            </>
          ) : pm === "image" ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={srcOf(preview)} alt={preview.filename} onClick={(e) => e.stopPropagation()} />
          ) : (
            <video src={srcOf(preview)} controls autoPlay onClick={(e) => e.stopPropagation()} />
          )}
        </div>
      )}
    </div>
  );
}
