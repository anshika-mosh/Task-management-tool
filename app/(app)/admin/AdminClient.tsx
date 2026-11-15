"use client";
import { useFormAction } from "@/lib/use-form-action";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { createBoard, createUser, deleteBoard, deleteUser, setUserRole, updateBoard } from "@/lib/actions";
import { BOARD_COLORS } from "@/lib/constants";
import { useConfirm } from "@/components/ConfirmProvider";
import type { BoardStats, User } from "@/lib/types";
import { Avatar, BoardAvatar } from "@/components/ui";

function Colors({ value }: { value: string }) {
  return (
    <div className="color-row">
      {BOARD_COLORS.map((c) => (
        <label key={c}><input type="radio" name="color" value={c} defaultChecked={c === value} /><span style={{ background: c }} /></label>
      ))}
    </div>
  );
}

function CreateBoard() {
  const { state, onSubmit, pending } = useFormAction(createBoard);
  const ref = useRef<HTMLFormElement>(null);
  const [key, setKey] = useState("");
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (state?.ok) { ref.current?.reset(); setKey(""); setTouched(false); } }, [state]);
  const suggest = (name: string) => {
    if (touched) return;
    const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, "").split(/\s+/).filter(Boolean);
    setKey((words.length > 1 ? words.map((w) => w[0]).join("") : (words[0] ?? "")).slice(0, 5));
  };
  return (
    <form onSubmit={onSubmit} ref={ref} className="card">
      <h2>Create a board</h2>
      <p className="muted small" style={{ margin: "4px 0 0" }}>The key prefixes every ticket on the board — e.g. <b>WEB-1</b>, <b>WEB-2</b>.</p>
      <div className="two">
        <div><label>Board name *</label><input name="name" required placeholder="Website Team" onChange={(e) => suggest(e.target.value)} /></div>
        <div><label>Key *</label><input name="key" required value={key} maxLength={10} placeholder="WEB" style={{ textTransform: "uppercase" }} onChange={(e) => { setTouched(true); setKey(e.target.value.toUpperCase()); }} /></div>
      </div>
      <label>Description</label>
      <input name="description" placeholder="What does this team work on?" />
      <label>Colour</label>
      <Colors value={BOARD_COLORS[0]} />
      {state?.error && <p className="err">{state.error}</p>}
      {state?.ok && <p className="okmsg">{state.ok}</p>}
      <button className="btn primary" style={{ marginTop: 16 }} disabled={pending}>{pending ? "Creating…" : "Create board"}</button>
    </form>
  );
}

function BoardRow({ b }: { b: BoardStats }) {
  const [editing, setEditing] = useState(false);
  const { state, onSubmit, pending } = useFormAction(updateBoard.bind(null, b.id));
  const [del, startDel] = useTransition();
  const confirm = useConfirm();
  useEffect(() => { if (state?.ok) setEditing(false); }, [state]);
  if (editing)
    return (
      <form onSubmit={onSubmit} className="card" style={{ marginBottom: 12 }}>
        <div className="muted small">Key <b>{b.key}</b> can&apos;t be changed after tickets exist.</div>
        <label>Name</label><input name="name" defaultValue={b.name} required />
        <label>Description</label><input name="description" defaultValue={b.description} />
        <label>Colour</label><Colors value={b.color} />
        {state?.error && <p className="err">{state.error}</p>}
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn primary sm" disabled={pending}>Save</button>
          <button type="button" className="btn ghost sm" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </form>
    );
  return (
    <div className="card row" style={{ marginBottom: 12 }}>
      <BoardAvatar boardKey={b.key} color={b.color} size={36} />
      <div className="grow">
        <Link href={`/boards/${b.key}`}><b>{b.name}</b></Link> <span className="key">{b.key}</span>
        <div className="muted small">{b.total} ticket{b.total === 1 ? "" : "s"}{b.description ? ` · ${b.description}` : ""}</div>
      </div>
      <button className="btn sm" onClick={() => setEditing(true)}>Edit</button>
      <button className="btn danger sm" disabled={del} onClick={async () => { if (await confirm({ title: `Delete board ${b.key}?`, message: `“${b.name}” and its ${b.total} ticket${b.total === 1 ? "" : "s"} (with comments, history and attachments) will be permanently deleted. This cannot be undone.`, confirmLabel: "Delete board", danger: true })) startDel(() => deleteBoard(b.id)); }}>Delete</button>
    </div>
  );
}

export function BoardForms({ boards }: { boards: BoardStats[] }) {
  return (
    <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", alignItems: "start" }}>
      <CreateBoard />
      <div>
        <h2 style={{ marginBottom: 12 }}>Boards ({boards.length})</h2>
        {boards.length === 0 ? <div className="card empty-state">No boards yet.</div> : boards.map((b) => <BoardRow key={b.id} b={b} />)}
      </div>
    </div>
  );
}

export function UserForms() {
  const { state, onSubmit, pending } = useFormAction(createUser);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return (
    <form onSubmit={onSubmit} ref={ref} className="card">
      <h2>Add a team member</h2>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0 12px" }}>
        <div><label>Name</label><input name="name" required /></div>
        <div><label>Email</label><input name="email" type="email" required /></div>
        <div><label>Password</label><input name="password" type="password" minLength={6} required /></div>
        <div><label>Role</label><select name="role" defaultValue="member"><option value="member">Member</option><option value="admin">Admin</option></select></div>
      </div>
      {state?.error && <p className="err">{state.error}</p>}
      {state?.ok && <p className="okmsg">{state.ok}</p>}
      <button className="btn primary" style={{ marginTop: 16 }} disabled={pending}>Add user</button>
    </form>
  );
}

export function UserRow({ user, isMe }: { user: User; isMe: boolean }) {
  const [pending, start] = useTransition();
  const confirm = useConfirm();
  return (
    <tr>
      <td><span className="row"><Avatar name={user.name} color={user.color} size={28} />{user.name}{isMe && <span className="muted small">(you)</span>}</span></td>
      <td>{user.email}</td>
      <td>
        <select value={user.role} disabled={isMe || pending} style={{ width: 120 }} onChange={(e) => start(() => setUserRole(user.id, e.target.value as "admin" | "member"))}>
          <option value="member">Member</option><option value="admin">Admin</option>
        </select>
      </td>
      <td style={{ textAlign: "right" }}>
        {!isMe && <button className="btn danger sm" disabled={pending} onClick={async () => { if (await confirm({ title: `Remove ${user.name}?`, message: "Their comments and history entries will be deleted and their tickets become unassigned.", confirmLabel: "Remove user", danger: true })) start(() => deleteUser(user.id)); }}>Remove</button>}
      </td>
    </tr>
  );
}
