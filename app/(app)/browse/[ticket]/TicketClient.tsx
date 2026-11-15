"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addComment, addProgress, deleteAttachment, deleteComment, deleteTicket, updateTicket } from "@/lib/actions";
import type { Attachment } from "@/lib/types";
import { formatSize, timeAgo } from "@/lib/format";
import { uploadFiles } from "@/components/uploader";

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

export function FieldSelect({ id, field, value, options, type = "select" }: { id: number; field: "status" | "priority" | "type" | "assignee_id" | "due_date"; value: string | number | null; options?: Opt[]; type?: "select" | "date" }) {
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
  const [state, action, pending] = useActionState(addComment.bind(null, ticketId), undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return (
    <form action={action} ref={ref}>
      <textarea name="body" rows={3} placeholder="Add a comment…" required />
      {state?.error && <p className="err">{state.error}</p>}
      <button className="btn primary sm" style={{ marginTop: 8 }} disabled={pending}>{pending ? "Saving…" : "Comment"}</button>
    </form>
  );
}

export function ProgressForm({ ticketId, current }: { ticketId: number; current: number }) {
  const [state, action, pending] = useActionState(addProgress.bind(null, ticketId), undefined);
  const ref = useRef<HTMLFormElement>(null);
  const [pct, setPct] = useState(current);
  useEffect(() => setPct(current), [current]);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return (
    <form action={action} ref={ref}>
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

const isImage = (m: string) => m.startsWith("image/");
const isVideo = (m: string) => m.startsWith("video/");

export function Attachments({ ticketId, items, meId, isAdmin }: { ticketId: number; items: Attachment[]; meId: number; isAdmin: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [pct, setPct] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState<Attachment | null>(null);
  const [, start] = useTransition();

  async function upload(files: File[]) {
    if (!files.length) return;
    setErr(""); setPct(0);
    try { await uploadFiles(ticketId, files, setPct); router.refresh(); } catch (e) { setErr((e as Error).message); }
    setPct(null);
  }

  // Paste screenshots straight into the ticket (like Jira).
  useEffect(() => {
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

  return (
    <div>
      <div
        className={"dropzone" + (over ? " over" : "")}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); upload(Array.from(e.dataTransfer.files)); }}
      >
        📎 Drop images, videos or files here, <u>browse</u>, or paste a screenshot
        <input ref={input} type="file" multiple hidden onChange={(e) => { upload(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
      </div>
      {pct !== null && <div className="upload-row"><div className="progress"><div style={{ width: `${pct}%` }} /></div>Uploading… {pct}%</div>}
      {err && <p className="err">{err}</p>}
      {items.length > 0 && (
        <div className="att-grid">
          {items.map((a) => {
            const src = `/api/files/${a.id}`;
            const canDelete = a.user_id === meId || isAdmin;
            return (
              <div className="att" key={a.id}>
                <button className="thumb" onClick={() => (isImage(a.mime) || isVideo(a.mime)) ? setPreview(a) : window.open(src, "_blank")} aria-label={`Open ${a.filename}`}>
                  {isImage(a.mime) ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={src} alt={a.filename} loading="lazy" />
                    : isVideo(a.mime) ? <video src={src + "#t=0.5"} preload="metadata" muted />
                    : a.mime === "application/pdf" ? "📕" : "📄"}
                </button>
                <div className="info">
                  <a href={`${src}?download=1`} className="name" title={a.filename}>{a.filename}</a>
                  <span className="muted">{formatSize(a.size)} · {a.user_name} · {timeAgo(a.created_at)}</span>
                </div>
                {canDelete && <button className="x" title="Delete attachment" onClick={() => confirm(`Delete ${a.filename}?`) && start(() => deleteAttachment(a.id))}>×</button>}
              </div>
            );
          })}
        </div>
      )}
      {preview && (
        <div className="lightbox" onClick={() => setPreview(null)}>
          <button className="close" aria-label="Close">×</button>
          {isImage(preview.mime)
            ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/api/files/${preview.id}`} alt={preview.filename} onClick={(e) => e.stopPropagation()} />
            : <video src={`/api/files/${preview.id}`} controls autoPlay onClick={(e) => e.stopPropagation()} />}
        </div>
      )}
    </div>
  );
}
