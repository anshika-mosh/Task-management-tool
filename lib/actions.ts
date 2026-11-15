"use server";

import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { all, get, run, tx, UPLOAD_DIR } from "./db";
import { createSession, destroySession, requireAdmin, requireUser } from "./auth";
import { PRIORITIES, STATUSES, TYPES, BOARD_COLORS } from "./constants";
import type { Board, Ticket } from "./types";
import { notifyActivity, notifyAssigned } from "./mail";

export type FormState = { error?: string; ok?: string } | undefined;

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");
const color = (c: string) => (/^#[0-9a-fA-F]{6}$/.test(c) ? c : BOARD_COLORS[0]);

/* ---------------------------------- auth --------------------------------- */

export async function login(_: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd.get("email")).toLowerCase();
  const password = str(fd.get("password"));
  const u = get<{ id: number; password_hash: string }>("SELECT id,password_hash FROM users WHERE email = ?", email);
  if (!u || !bcrypt.compareSync(password, u.password_hash)) return { error: "Invalid email or password." };
  await createSession(u.id);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

/* --------------------------------- boards -------------------------------- */

function validateBoard(fd: FormData) {
  const name = str(fd.get("name"));
  const key = str(fd.get("key")).toUpperCase();
  if (!name) return { error: "Board name is required." } as const;
  if (!/^[A-Z][A-Z0-9]{1,9}$/.test(key)) return { error: "Key must be 2–10 letters/digits and start with a letter (e.g. WEB)." } as const;
  return { name, key, description: str(fd.get("description")), color: color(str(fd.get("color"))) } as const;
}

export async function createBoard(_: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const v = validateBoard(fd);
  if ("error" in v) return v;
  if (get("SELECT id FROM boards WHERE key = ?", v.key)) return { error: `The key ${v.key} is already used by another board.` };
  run("INSERT INTO boards (key,name,description,color) VALUES (?,?,?,?)", v.key, v.name, v.description, v.color);
  revalidatePath("/", "layout");
  return { ok: `Board ${v.key} created.` };
}

export async function updateBoard(id: number, _: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const name = str(fd.get("name"));
  if (!name) return { error: "Board name is required." };
  run("UPDATE boards SET name=?, description=?, color=? WHERE id=?", name, str(fd.get("description")), color(str(fd.get("color"))), id);
  revalidatePath("/", "layout");
  return { ok: "Saved." };
}

export async function deleteBoard(id: number) {
  await requireAdmin();
  removeFiles(all<{ stored_name: string }>("SELECT a.stored_name FROM attachments a JOIN tickets t ON t.id=a.ticket_id WHERE t.board_id=?", id));
  run("DELETE FROM boards WHERE id = ?", id);
  revalidatePath("/", "layout");
}

/* ---------------------------------- users -------------------------------- */

export async function createUser(_: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const name = str(fd.get("name"));
  const email = str(fd.get("email")).toLowerCase();
  const password = str(fd.get("password"));
  const role = str(fd.get("role")) === "admin" ? "admin" : "member";
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return { error: "Name and a valid email are required." };
  if (password.length < 6) return { error: "Password must be at least 6 characters." };
  if (get("SELECT id FROM users WHERE email = ?", email)) return { error: "That email is already registered." };
  const c = BOARD_COLORS[Math.floor(Math.random() * BOARD_COLORS.length)];
  run("INSERT INTO users (name,email,password_hash,role,color) VALUES (?,?,?,?,?)", name, email, bcrypt.hashSync(password, 10), role, c);
  revalidatePath("/", "layout");
  return { ok: `${name} added.` };
}

export async function setUserRole(id: number, role: "admin" | "member") {
  const me = await requireAdmin();
  if (me.id === id) return;
  run("UPDATE users SET role = ? WHERE id = ?", role, id);
  revalidatePath("/admin");
}

export async function deleteUser(id: number) {
  const me = await requireAdmin();
  if (me.id === id) return;
  run("DELETE FROM users WHERE id = ?", id);
  revalidatePath("/", "layout");
}

/* --------------------------------- tickets ------------------------------- */

export type NewTicket = {
  boardId: number; title: string; description?: string; type?: string; priority?: string; assigneeId?: number | null; dueDate?: string | null; sprintId?: number | null;
};

export async function createTicket(input: NewTicket): Promise<{ error?: string; key?: string }> {
  const me = await requireUser();
  const title = (input.title ?? "").trim();
  if (!title) return { error: "Summary is required." };
  const board = get<Board>("SELECT * FROM boards WHERE id = ?", input.boardId);
  if (!board) return { error: "Choose a board." };
  const type = TYPES.some((t) => t.id === input.type) ? input.type! : "task";
  const priority = PRIORITIES.some((t) => t.id === input.priority) ? input.priority! : "medium";
  const sprint = input.sprintId ? get<{ id: number }>("SELECT id FROM sprints WHERE id = ? AND board_id = ? AND status != 'completed'", input.sprintId, board.id) : undefined;
  const key = tx(() => {
    const { counter } = get<{ counter: number }>("UPDATE boards SET counter = counter + 1 WHERE id = ? RETURNING counter", board.id)!;
    const r = run(
      "INSERT INTO tickets (board_id,number,title,description,type,priority,assignee_id,reporter_id,due_date,sprint_id) VALUES (?,?,?,?,?,?,?,?,?,?)",
      board.id, counter, title.slice(0, 250), (input.description ?? "").trim(), type, priority, input.assigneeId || null, me.id, input.dueDate || null, sprint?.id ?? null,
    );
    run("INSERT INTO activity (ticket_id,user_id,action) VALUES (?,?,'created')", Number(r.lastInsertRowid), me.id);
    return { id: Number(r.lastInsertRowid), key: `${board.key}-${counter}` };
  });
  if (input.assigneeId) notifyAssigned(key.id, me.id);
  revalidatePath("/", "layout");
  return { key: key.key };
}

const FIELDS = {
  title: "Summary", description: "Description", type: "Type", status: "Status", priority: "Priority", assignee_id: "Assigned to", due_date: "Due date", sprint_id: "Sprint",
} as const;
type Field = keyof typeof FIELDS;

export async function updateTicket(ticketId: number, field: Field, value: string | number | null) {
  const me = await requireUser();
  if (!(field in FIELDS)) return;
  const t = get<Ticket & Record<string, string | number | null>>("SELECT * FROM tickets WHERE id = ?", ticketId);
  if (!t) return;
  let v: string | number | null = value === "" ? null : value;
  if (field === "status" && !STATUSES.some((s) => s.id === v)) return;
  if (field === "priority" && !PRIORITIES.some((s) => s.id === v)) return;
  if (field === "type" && !TYPES.some((s) => s.id === v)) return;
  if (field === "title") { v = String(v ?? "").trim().slice(0, 250); if (!v) return; }
  if (field === "description") v = String(v ?? "").trim();
  if (field === "assignee_id") v = v ? Number(v) : null;
  if (field === "sprint_id") {
    v = v ? Number(v) : null;
    if (v !== null && !get("SELECT 1 FROM sprints WHERE id = ? AND board_id = ? AND status != 'completed'", v, t.board_id)) return;
  }
  const old = t[field];
  if ((old ?? null) === v) return;
  const show = (f: Field, x: string | number | null) =>
    x == null ? (f === "sprint_id" ? "Backlog" : f === "assignee_id" ? "Unassigned" : null)
      : f === "assignee_id" ? get<{ name: string }>("SELECT name FROM users WHERE id = ?", Number(x))?.name ?? String(x)
      : f === "sprint_id" ? get<{ name: string }>("SELECT name FROM sprints WHERE id = ?", Number(x))?.name ?? String(x)
      : String(x);
  tx(() => {
    run(`UPDATE tickets SET ${field} = ?, updated_at = datetime('now') WHERE id = ?`, v, ticketId);
    if (field === "status" && v === "done") run("UPDATE tickets SET progress = 100 WHERE id = ?", ticketId);
    run(
      "INSERT INTO activity (ticket_id,user_id,action,field,old_value,new_value) VALUES (?,?,'changed',?,?,?)",
      ticketId, me.id, FIELDS[field], field === "description" ? null : show(field, old), field === "description" ? null : show(field, v),
    );
  });
  if (field === "assignee_id") notifyAssigned(ticketId, me.id);
  else if (field === "sprint_id") { /* sprint planning is bulk housekeeping: no email */ }
  else if (field === "description") notifyActivity(ticketId, me.id, "updated the description");
  else notifyActivity(ticketId, me.id, `changed ${FIELDS[field]} from ${show(field, old) ?? "none"} to ${show(field, v) ?? "none"}`);
  revalidatePath("/", "layout");
}

export async function deleteTicket(ticketId: number) {
  const me = await requireUser();
  const t = get<{ reporter_id: number; board_id: number }>("SELECT reporter_id,board_id FROM tickets WHERE id = ?", ticketId);
  if (!t) return;
  if (me.role !== "admin" && t.reporter_id !== me.id) return;
  const board = get<{ key: string }>("SELECT key FROM boards WHERE id = ?", t.board_id)!;
  removeFiles(all<{ stored_name: string }>("SELECT stored_name FROM attachments WHERE ticket_id = ?", ticketId));
  run("DELETE FROM tickets WHERE id = ?", ticketId);
  revalidatePath("/", "layout");
  redirect(`/boards/${board.key}`);
}

/* --------------------------- comments & progress ------------------------- */

export async function addComment(ticketId: number, _: FormState, fd: FormData): Promise<FormState> {
  const me = await requireUser();
  const body = str(fd.get("body"));
  if (!body) return { error: "Write something first." };
  run("INSERT INTO comments (ticket_id,user_id,body,kind) VALUES (?,?,?,'comment')", ticketId, me.id, body);
  run("UPDATE tickets SET updated_at = datetime('now') WHERE id = ?", ticketId);
  notifyActivity(ticketId, me.id, "commented", body);
  revalidatePath("/", "layout");
  return { ok: "Comment added." };
}

/** A progress update: note + optional % complete + optional hours logged. */
export async function addProgress(ticketId: number, _: FormState, fd: FormData): Promise<FormState> {
  const me = await requireUser();
  const body = str(fd.get("body"));
  const pctRaw = str(fd.get("progress"));
  const hoursRaw = str(fd.get("hours"));
  if (!body) return { error: "Describe what you did." };
  const pct = pctRaw === "" ? null : Math.max(0, Math.min(100, Math.round(Number(pctRaw))));
  const hours = hoursRaw === "" ? null : Math.max(0, Number(hoursRaw));
  if ((pct !== null && Number.isNaN(pct)) || (hours !== null && Number.isNaN(hours))) return { error: "Progress and hours must be numbers." };
  const t = get<{ progress: number; status: string }>("SELECT progress,status FROM tickets WHERE id = ?", ticketId);
  if (!t) return { error: "Ticket not found." };
  tx(() => {
    run("INSERT INTO comments (ticket_id,user_id,body,kind,progress,hours) VALUES (?,?,?,'progress',?,?)", ticketId, me.id, body, pct, hours);
    if (pct !== null) {
      run("UPDATE tickets SET progress = ?, updated_at = datetime('now') WHERE id = ?", pct, ticketId);
      run("INSERT INTO activity (ticket_id,user_id,action,field,old_value,new_value) VALUES (?,?,'changed','Progress',?,?)", ticketId, me.id, `${t.progress}%`, `${pct}%`);
      if (t.status === "todo" && pct > 0) {
        run("UPDATE tickets SET status = 'in_progress' WHERE id = ?", ticketId);
        run("INSERT INTO activity (ticket_id,user_id,action,field,old_value,new_value) VALUES (?,?,'changed','Status','todo','in_progress')", ticketId, me.id);
      }
    } else run("UPDATE tickets SET updated_at = datetime('now') WHERE id = ?", ticketId);
  });
  const bits = [pct !== null ? `${pct}% complete` : "", hours ? `${hours}h logged` : ""].filter(Boolean).join(", ");
  notifyActivity(ticketId, me.id, `posted a progress update${bits ? ` (${bits})` : ""}`, body);
  revalidatePath("/", "layout");
  return { ok: "Progress update posted." };
}

export async function deleteComment(id: number) {
  const me = await requireUser();
  const c = get<{ user_id: number }>("SELECT user_id FROM comments WHERE id = ?", id);
  if (!c || (c.user_id !== me.id && me.role !== "admin")) return;
  run("DELETE FROM comments WHERE id = ?", id);
  revalidatePath("/", "layout");
}

/* ------------------------------- attachments ----------------------------- */

function removeFiles(rows: { stored_name: string }[]) {
  for (const r of rows) fs.rm(path.join(UPLOAD_DIR, r.stored_name), { force: true }, () => {});
}

export async function deleteAttachment(id: number) {
  const me = await requireUser();
  const a = get<{ user_id: number; stored_name: string; ticket_id: number; filename: string }>("SELECT * FROM attachments WHERE id = ?", id);
  if (!a || (a.user_id !== me.id && me.role !== "admin")) return;
  run("DELETE FROM attachments WHERE id = ?", id);
  removeFiles([a]);
  run("INSERT INTO activity (ticket_id,user_id,action,field,old_value) VALUES (?,?,'removed','Attachment',?)", a.ticket_id, me.id, a.filename);
  revalidatePath("/", "layout");
}

/* --------------------------------- sprints ------------------------------- */

export type SprintResult = { error?: string };

export async function createSprint(boardId: number, _: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  const board = get<Board>("SELECT * FROM boards WHERE id = ?", boardId);
  if (!board) return { error: "Board not found." };
  const name = str(fd.get("name"));
  const start = str(fd.get("start")) || null;
  const end = str(fd.get("end")) || null;
  if (!name) return { error: "Sprint name is required." };
  if (start && end && end < start) return { error: "End date must be after the start date." };
  run("INSERT INTO sprints (board_id,name,goal,start_date,end_date) VALUES (?,?,?,?,?)", boardId, name.slice(0, 100), str(fd.get("goal")), start, end);
  revalidatePath("/", "layout");
  return { ok: `Sprint "${name}" created.` };
}

export async function startSprint(id: number): Promise<SprintResult> {
  await requireUser();
  const s = get<{ board_id: number; status: string }>("SELECT * FROM sprints WHERE id = ?", id);
  if (!s || s.status !== "planned") return { error: "Only a planned sprint can be started." };
  const active = get<{ name: string }>("SELECT name FROM sprints WHERE board_id = ? AND status = 'active'", s.board_id);
  if (active) return { error: `"${active.name}" is already active. Complete it before starting another.` };
  run("UPDATE sprints SET status = 'active', start_date = COALESCE(start_date, date('now')) WHERE id = ?", id);
  revalidatePath("/", "layout");
  return {};
}

/** Completing a sprint moves its unfinished tickets to `moveTo` (another planned sprint) or back to the backlog. */
export async function completeSprint(id: number, moveTo: number | null): Promise<SprintResult> {
  const me = await requireUser();
  const s = get<{ board_id: number; status: string }>("SELECT * FROM sprints WHERE id = ?", id);
  if (!s || s.status !== "active") return { error: "Only an active sprint can be completed." };
  const dest = moveTo ? get<{ id: number; name: string }>("SELECT id,name FROM sprints WHERE id = ? AND board_id = ? AND status = 'planned'", moveTo, s.board_id) : undefined;
  tx(() => {
    const open = all<{ id: number }>("SELECT id FROM tickets WHERE sprint_id = ? AND status != 'done'", id);
    for (const t of open) {
      run("UPDATE tickets SET sprint_id = ? WHERE id = ?", dest?.id ?? null, t.id);
      run("INSERT INTO activity (ticket_id,user_id,action,field,old_value,new_value) VALUES (?,?,'changed','Sprint',(SELECT name FROM sprints WHERE id = ?),?)", t.id, me.id, id, dest?.name ?? "Backlog");
    }
    run("UPDATE sprints SET status = 'completed', completed_at = datetime('now') WHERE id = ?", id);
  });
  revalidatePath("/", "layout");
  return {};
}

export async function deleteSprint(id: number): Promise<SprintResult> {
  await requireUser();
  const s = get<{ status: string }>("SELECT status FROM sprints WHERE id = ?", id);
  if (!s) return {};
  if (s.status === "active") return { error: "Complete the active sprint before deleting it." };
  run("DELETE FROM sprints WHERE id = ?", id); // its tickets fall back to the backlog (ON DELETE SET NULL)
  revalidatePath("/", "layout");
  return {};
}
