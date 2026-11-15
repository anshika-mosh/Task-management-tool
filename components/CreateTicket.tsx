"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTicket } from "@/lib/actions";
import { PRIORITIES, TYPES } from "@/lib/constants";
import type { Board, User } from "@/lib/types";
import { formatSize } from "@/lib/format";
import Modal from "./Modal";
import { uploadFiles } from "./uploader";

export type SprintOpt = { id: number; board_id: number; name: string; status: string };

export default function CreateTicket({ boards, users, sprints, defaultBoardId, onClose }: { boards: Board[]; users: User[]; sprints: SprintOpt[]; defaultBoardId?: number; onClose: () => void }) {
  const router = useRouter();
  const [boardId, setBoardId] = useState(defaultBoardId ?? boards[0]?.id);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [busy, startTransition] = useTransition();
  const [pct, setPct] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const board = boards.find((b) => b.id === boardId);
  const boardSprints = sprints.filter((s) => s.board_id === boardId);
  const activeSprint = boardSprints.find((s) => s.status === "active");

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError("");
    startTransition(async () => {
      const res = await createTicket({
        boardId: Number(boardId),
        title: String(fd.get("title") ?? ""),
        description: String(fd.get("description") ?? ""),
        type: String(fd.get("type")),
        priority: String(fd.get("priority")),
        assigneeId: fd.get("assignee") ? Number(fd.get("assignee")) : null,
        dueDate: String(fd.get("due") ?? "") || null,
        sprintId: fd.get("sprint") ? Number(fd.get("sprint")) : null,
      });
      if (res.error || !res.key) return setError(res.error ?? "Could not create ticket");
      if (files.length) {
        try {
          const id = await fetch(`/api/ticket-id?key=${res.key}`).then((r) => r.json()).then((j) => j.id as number);
          await uploadFiles(id, files, setPct);
        } catch (err) {
          setError(`Ticket ${res.key} created, but attachments failed: ${(err as Error).message}`);
          router.push(`/browse/${res.key}`);
          return;
        }
      }
      onClose();
      router.push(`/browse/${res.key}`);
    });
  }

  return (
    <Modal onClose={onClose}>
      <h2>Create ticket</h2>
      <form onSubmit={submit}>
        <div className="two">
          <div>
            <label>Board *</label>
            <select value={boardId} onChange={(e) => setBoardId(Number(e.target.value))}>
              {boards.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.key})</option>)}
            </select>
          </div>
          <div>
            <label>Type</label>
            <select name="type" defaultValue="task">{TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
          </div>
        </div>
        <label>Summary *</label>
        <input name="title" required autoFocus placeholder={board ? `What needs to be done in ${board.key}?` : ""} maxLength={250} />
        <label>Description</label>
        <textarea name="description" rows={5} placeholder="Add details, steps to reproduce, acceptance criteria…" />
        <div className="two">
          <div>
            <label>Priority</label>
            <select name="priority" defaultValue="medium">{PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
          </div>
          <div>
            <label>Assigned to</label>
            <select name="assignee" defaultValue=""><option value="">Unassigned</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
          </div>
        </div>
        <div className="two">
          <div>
            <label>Sprint</label>
            <select name="sprint" key={boardId} defaultValue={activeSprint?.id ?? ""}>
              <option value="">Backlog (no sprint)</option>
              {boardSprints.map((s) => <option key={s.id} value={s.id}>{s.name}{s.status === "active" ? " (active)" : ""}</option>)}
            </select>
          </div>
          <div><label>Due date</label><input type="date" name="due" /></div>
        </div>
        <label>Attachments (images, videos, files)</label>
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])])} />
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>📎 Add files</button>
        {files.map((f, i) => (
          <div key={i} className="upload-row"><span className="grow">{f.name} <span className="muted">({formatSize(f.size)})</span></span>
            <button type="button" className="btn sm ghost" onClick={() => setFiles(files.filter((_, j) => j !== i))}>Remove</button></div>
        ))}
        {pct !== null && <div className="upload-row"><div className="progress"><div style={{ width: `${pct}%` }} /></div>{pct}%</div>}
        {error && <p className="err">{error}</p>}
        <div className="modal-foot">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}>{busy ? "Creating…" : "Create"}</button>
        </div>
      </form>
    </Modal>
  );
}
