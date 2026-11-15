"use server";

import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { col, nextId, now, today, toRow, UPLOAD_DIR, type Doc } from "./db";
import { createSession, destroySession, requireAdmin, requireUser } from "./auth";
import { PRIORITIES, STATUSES, TYPES, BOARD_COLORS } from "./constants";
import { parseLink } from "./links";
import { notifyActivity, notifyAssigned } from "./mail";
import { isEmptyRich, normalizeRich } from "./rich";
import type { Board } from "./types";

export type FormState = { error?: string; ok?: string } | undefined;
export type SprintResult = { error?: string };

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");
const color = (c: string) => (/^#[0-9a-fA-F]{6}$/.test(c) ? c : BOARD_COLORS[0]);
const refresh = () => revalidatePath("/", "layout");

async function log(ticketId: number, userId: number, action: string, field: string | null = null, oldValue: string | null = null, newValue: string | null = null) {
  await (await col("activity")).insertOne({ _id: (await nextId("activity")) as never, ticket_id: ticketId, user_id: userId, action, field, old_value: oldValue, new_value: newValue, created_at: now() });
}

/* ---------------------------------- auth --------------------------------- */

export async function login(_: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd.get("email")).toLowerCase();
  const password = str(fd.get("password"));
  const u = await (await col("users")).findOne({ email });
  if (!u || !bcrypt.compareSync(password, u.password_hash)) return { error: "Invalid email or password." };
  await createSession(u._id as number);
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
  const boards = await col("boards");
  if (await boards.findOne({ key: v.key })) return { error: `The key ${v.key} is already used by another board.` };
  try {
    await boards.insertOne({ _id: (await nextId("boards")) as never, key: v.key, name: v.name, description: v.description, color: v.color, counter: 0, created_at: now() });
  } catch (e) {
    if ((e as { code?: number }).code === 11000) return { error: `The key ${v.key} is already used by another board.` };
    throw e;
  }
  refresh();
  return { ok: `Board ${v.key} created.` };
}

export async function updateBoard(id: number, _: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const name = str(fd.get("name"));
  if (!name) return { error: "Board name is required." };
  await (await col("boards")).updateOne({ _id: id as never }, { $set: { name, description: str(fd.get("description")), color: color(str(fd.get("color"))) } });
  refresh();
  return { ok: "Saved." };
}

/** Deletes tickets and everything hanging off them (comments, files, history). */
async function purgeTickets(filter: Doc) {
  const tickets = await col("tickets");
  const ids = (await tickets.find(filter, { projection: { _id: 1 } }).toArray()).map((t) => t._id as unknown as number);
  if (ids.length === 0) return;
  const attachments = await col("attachments");
  removeFiles(await attachments.find({ ticket_id: { $in: ids }, kind: "file" }).toArray());
  await Promise.all([
    attachments.deleteMany({ ticket_id: { $in: ids } }),
    (await col("comments")).deleteMany({ ticket_id: { $in: ids } }),
    (await col("activity")).deleteMany({ ticket_id: { $in: ids } }),
  ]);
  await tickets.deleteMany({ _id: { $in: ids as never[] } });
}

export async function deleteBoard(id: number) {
  await requireAdmin();
  await purgeTickets({ board_id: id });
  await (await col("sprints")).deleteMany({ board_id: id });
  await (await col("boards")).deleteOne({ _id: id as never });
  refresh();
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
  const users = await col("users");
  if (await users.findOne({ email })) return { error: "That email is already registered." };
  const c = BOARD_COLORS[Math.floor(Math.random() * BOARD_COLORS.length)];
  try {
    await users.insertOne({ _id: (await nextId("users")) as never, name, email, password_hash: bcrypt.hashSync(password, 10), role, color: c, created_at: now() });
  } catch (e) {
    if ((e as { code?: number }).code === 11000) return { error: "That email is already registered." };
    throw e;
  }
  refresh();
  return { ok: `${name} added.` };
}

export async function setUserRole(id: number, role: "admin" | "member") {
  const me = await requireAdmin();
  if (me.id === id) return;
  await (await col("users")).updateOne({ _id: id as never }, { $set: { role: role === "admin" ? "admin" : "member" } });
  revalidatePath("/admin");
}

export async function deleteUser(id: number) {
  const me = await requireAdmin();
  if (me.id === id) return;
  const attachments = await col("attachments");
  removeFiles(await attachments.find({ user_id: id, kind: "file" }).toArray());
  await Promise.all([
    attachments.deleteMany({ user_id: id }),
    (await col("comments")).deleteMany({ user_id: id }),
    (await col("activity")).deleteMany({ user_id: id }),
  ]);
  const tickets = await col("tickets");
  await tickets.updateMany({ assignee_id: id }, { $set: { assignee_id: null } });
  await tickets.updateMany({ reporter_id: id }, { $set: { reporter_id: null } });
  await (await col("users")).deleteOne({ _id: id as never });
  refresh();
}

/* --------------------------------- tickets ------------------------------- */

export type NewTicket = {
  boardId: number; title: string; description?: string; type?: string; priority?: string; assigneeId?: number | null; dueDate?: string | null; sprintId?: number | null;
  links?: { url: string; name?: string }[];
};

export async function createTicket(input: NewTicket): Promise<{ error?: string; key?: string }> {
  const me = await requireUser();
  const title = (input.title ?? "").trim();
  if (!title) return { error: "Summary is required." };
  const boards = await col("boards");
  const board = await boards.findOne({ _id: input.boardId as never });
  if (!board) return { error: "Choose a board." };
  const type = TYPES.some((t) => t.id === input.type) ? input.type! : "task";
  const priority = PRIORITIES.some((t) => t.id === input.priority) ? input.priority! : "medium";
  const sprint = input.sprintId ? await (await col("sprints")).findOne({ _id: input.sprintId as never, board_id: board._id, status: { $ne: "completed" } }) : null;
  const links = (input.links ?? []).map((l) => ({ p: parseLink(l.url), name: l.name?.trim() })).filter((l) => l.p);

  // Atomic per-board counter => unique, gap-tolerant KEY-number.
  const bumped = await boards.findOneAndUpdate({ _id: board._id }, { $inc: { counter: 1 } }, { returnDocument: "after" });
  const number = bumped!.counter as number;
  const id = await nextId("tickets");
  const ts = now();
  await (await col("tickets")).insertOne({
    _id: id as never, board_id: board._id, number, title: title.slice(0, 250), description: normalizeRich(input.description), type, status: "todo", priority,
    assignee_id: input.assigneeId || null, reporter_id: me.id, progress: 0, due_date: input.dueDate || null, sprint_id: sprint?._id ?? null, created_at: ts, updated_at: ts,
  });
  await log(id, me.id, "created");
  for (const l of links) await insertLink(id, me.id, l.p!, l.name);
  if (input.assigneeId) notifyAssigned(id, me.id);
  refresh();
  return { key: `${board.key}-${number}` };
}

const FIELDS = {
  title: "Summary", description: "Description", type: "Type", status: "Status", priority: "Priority", assignee_id: "Assigned to", due_date: "Due date", sprint_id: "Sprint",
} as const;
type Field = keyof typeof FIELDS;

async function display(field: Field, x: string | number | null | undefined): Promise<string | null> {
  if (x == null) return field === "sprint_id" ? "Backlog" : field === "assignee_id" ? "Unassigned" : null;
  if (field === "assignee_id") return (await (await col("users")).findOne({ _id: Number(x) as never }))?.name ?? String(x);
  if (field === "sprint_id") return (await (await col("sprints")).findOne({ _id: Number(x) as never }))?.name ?? String(x);
  return String(x);
}

export async function updateTicket(ticketId: number, field: Field, value: string | number | null) {
  const me = await requireUser();
  if (!(field in FIELDS)) return;
  const tickets = await col("tickets");
  const t = await tickets.findOne({ _id: ticketId as never });
  if (!t) return;
  let v: string | number | null = value === "" ? null : value;
  if (field === "status" && !STATUSES.some((s) => s.id === v)) return;
  if (field === "priority" && !PRIORITIES.some((s) => s.id === v)) return;
  if (field === "type" && !TYPES.some((s) => s.id === v)) return;
  if (field === "title") { v = String(v ?? "").trim().slice(0, 250); if (!v) return; }
  if (field === "description") v = normalizeRich(String(v ?? ""));
  if (field === "assignee_id") v = v ? Number(v) : null;
  if (field === "sprint_id") {
    v = v ? Number(v) : null;
    if (v !== null && !(await (await col("sprints")).findOne({ _id: v as never, board_id: t.board_id, status: { $ne: "completed" } }))) return;
  }
  const old = t[field] ?? null;
  if (old === v) return;
  const set: Doc = { [field]: v, updated_at: now() };
  if (field === "status" && v === "done") set.progress = 100;
  await tickets.updateOne({ _id: ticketId as never }, { $set: set });
  const hide = field === "description";
  const from = hide ? null : await display(field, old);
  const to = hide ? null : await display(field, v);
  await log(ticketId, me.id, "changed", FIELDS[field], from, to);

  if (field === "assignee_id") notifyAssigned(ticketId, me.id);
  else if (field === "sprint_id") { /* sprint planning is bulk housekeeping: no email */ }
  else if (field === "description") notifyActivity(ticketId, me.id, "updated the description");
  else notifyActivity(ticketId, me.id, `changed ${FIELDS[field]} from ${from ?? "none"} to ${to ?? "none"}`);
  refresh();
}

export async function deleteTicket(ticketId: number) {
  const me = await requireUser();
  const t = await (await col("tickets")).findOne({ _id: ticketId as never });
  if (!t) return;
  if (me.role !== "admin" && t.reporter_id !== me.id) return;
  const board = await (await col("boards")).findOne({ _id: t.board_id });
  await purgeTickets({ _id: ticketId });
  refresh();
  redirect(`/boards/${board?.key ?? ""}`);
}

/* --------------------------- comments & progress ------------------------- */

async function touch(ticketId: number) {
  await (await col("tickets")).updateOne({ _id: ticketId as never }, { $set: { updated_at: now() } });
}

export async function addComment(ticketId: number, _: FormState, fd: FormData): Promise<FormState> {
  const me = await requireUser();
  const body = normalizeRich(str(fd.get("body")));
  if (isEmptyRich(body)) return { error: "Write something first." };
  if (!(await (await col("tickets")).findOne({ _id: ticketId as never }, { projection: { _id: 1 } }))) return { error: "Ticket not found." };
  await (await col("comments")).insertOne({ _id: (await nextId("comments")) as never, ticket_id: ticketId, user_id: me.id, body, kind: "comment", progress: null, hours: null, created_at: now() });
  await touch(ticketId);
  notifyActivity(ticketId, me.id, "commented", body);
  refresh();
  return { ok: "Comment added." };
}

/** A progress update: note + optional % complete + optional hours logged. */
export async function addProgress(ticketId: number, _: FormState, fd: FormData): Promise<FormState> {
  const me = await requireUser();
  const body = normalizeRich(str(fd.get("body")));
  const pctRaw = str(fd.get("progress"));
  const hoursRaw = str(fd.get("hours"));
  if (isEmptyRich(body)) return { error: "Describe what you did." };
  const pct = pctRaw === "" ? null : Math.max(0, Math.min(100, Math.round(Number(pctRaw))));
  const hours = hoursRaw === "" ? null : Math.max(0, Number(hoursRaw));
  if ((pct !== null && Number.isNaN(pct)) || (hours !== null && Number.isNaN(hours))) return { error: "Progress and hours must be numbers." };
  const tickets = await col("tickets");
  const t = await tickets.findOne({ _id: ticketId as never });
  if (!t) return { error: "Ticket not found." };

  await (await col("comments")).insertOne({ _id: (await nextId("comments")) as never, ticket_id: ticketId, user_id: me.id, body, kind: "progress", progress: pct, hours, created_at: now() });
  if (pct !== null) {
    const set: Doc = { progress: pct, updated_at: now() };
    await log(ticketId, me.id, "changed", "Progress", `${t.progress}%`, `${pct}%`);
    if (t.status === "todo" && pct > 0) {
      set.status = "in_progress";
      await log(ticketId, me.id, "changed", "Status", "todo", "in_progress");
    }
    await tickets.updateOne({ _id: ticketId as never }, { $set: set });
  } else await touch(ticketId);

  const bits = [pct !== null ? `${pct}% complete` : "", hours ? `${hours}h logged` : ""].filter(Boolean).join(", ");
  notifyActivity(ticketId, me.id, `posted a progress update${bits ? ` (${bits})` : ""}`, body);
  refresh();
  return { ok: "Progress update posted." };
}

export async function deleteComment(id: number) {
  const me = await requireUser();
  const comments = await col("comments");
  const c = await comments.findOne({ _id: id as never });
  if (!c || (c.user_id !== me.id && me.role !== "admin")) return;
  await comments.deleteOne({ _id: id as never });
  refresh();
}

/* ------------------------------- attachments ----------------------------- */

function removeFiles(rows: Doc[]) {
  for (const r of rows) if (r.stored_name) fs.rm(path.join(UPLOAD_DIR, path.basename(r.stored_name)), { force: true }, () => {});
}

async function insertLink(ticketId: number, userId: number, p: NonNullable<ReturnType<typeof parseLink>>, name?: string) {
  const filename = (name || p.defaultName).slice(0, 200);
  await (await col("attachments")).insertOne({
    _id: (await nextId("attachments")) as never, ticket_id: ticketId, user_id: userId, kind: "link", link_type: p.type, url: p.url, drive_id: p.driveId,
    filename, mime: "", size: 0, created_at: now(),
  });
  await log(ticketId, userId, "added", "Attachment", null, filename);
}

/** Attach an image/video/file by link (Google Drive share link, or any URL). */
export async function addLinkAttachment(ticketId: number, _: FormState, fd: FormData): Promise<FormState> {
  const me = await requireUser();
  const p = parseLink(str(fd.get("url")));
  if (!p) return { error: "Paste a full link starting with https://" };
  if (!(await (await col("tickets")).findOne({ _id: ticketId as never }, { projection: { _id: 1 } }))) return { error: "Ticket not found." };
  const name = str(fd.get("name"));
  await insertLink(ticketId, me.id, p, name || undefined);
  await touch(ticketId);
  notifyActivity(ticketId, me.id, `attached ${name || p.defaultName}`);
  refresh();
  return { ok: "Link attached." };
}

export async function deleteAttachment(id: number) {
  const me = await requireUser();
  const attachments = await col("attachments");
  const a = await attachments.findOne({ _id: id as never });
  if (!a || (a.user_id !== me.id && me.role !== "admin")) return;
  await attachments.deleteOne({ _id: id as never });
  if (a.kind === "file") removeFiles([a]);
  await log(a.ticket_id, me.id, "removed", "Attachment", a.filename, null);
  refresh();
}

/* --------------------------------- sprints ------------------------------- */

export async function createSprint(boardId: number, _: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  const board = toRow<Board>(await (await col("boards")).findOne({ _id: boardId as never }));
  if (!board) return { error: "Board not found." };
  const name = str(fd.get("name"));
  const start = str(fd.get("start")) || null;
  const end = str(fd.get("end")) || null;
  if (!name) return { error: "Sprint name is required." };
  if (start && end && end < start) return { error: "End date must be after the start date." };
  await (await col("sprints")).insertOne({
    _id: (await nextId("sprints")) as never, board_id: boardId, name: name.slice(0, 100), goal: str(fd.get("goal")), start_date: start, end_date: end, status: "planned", completed_at: null, created_at: now(),
  });
  refresh();
  return { ok: `Sprint "${name}" created.` };
}

export async function startSprint(id: number): Promise<SprintResult> {
  await requireUser();
  const sprints = await col("sprints");
  const s = await sprints.findOne({ _id: id as never });
  if (!s || s.status !== "planned") return { error: "Only a planned sprint can be started." };
  const active = await sprints.findOne({ board_id: s.board_id, status: "active" });
  if (active) return { error: `"${active.name}" is already active. Complete it before starting another.` };
  await sprints.updateOne({ _id: id as never }, { $set: { status: "active", start_date: s.start_date ?? today() } });
  refresh();
  return {};
}

/** Completing a sprint moves its unfinished tickets to `moveTo` (another planned sprint) or back to the backlog. */
export async function completeSprint(id: number, moveTo: number | null): Promise<SprintResult> {
  const me = await requireUser();
  const sprints = await col("sprints");
  const s = await sprints.findOne({ _id: id as never });
  if (!s || s.status !== "active") return { error: "Only an active sprint can be completed." };
  const dest = moveTo ? await sprints.findOne({ _id: moveTo as never, board_id: s.board_id, status: "planned" }) : null;
  const tickets = await col("tickets");
  const open = await tickets.find({ sprint_id: id, status: { $ne: "done" } }, { projection: { _id: 1 } }).toArray();
  // Move tickets first, then close the sprint: if interrupted, completing again finishes the job.
  for (const t of open) {
    await tickets.updateOne({ _id: t._id }, { $set: { sprint_id: dest?._id ?? null } });
    await log(t._id as unknown as number, me.id, "changed", "Sprint", s.name, dest?.name ?? "Backlog");
  }
  await sprints.updateOne({ _id: id as never }, { $set: { status: "completed", completed_at: now() } });
  refresh();
  return {};
}

export async function deleteSprint(id: number): Promise<SprintResult> {
  await requireUser();
  const sprints = await col("sprints");
  const s = await sprints.findOne({ _id: id as never });
  if (!s) return {};
  if (s.status === "active") return { error: "Complete the active sprint before deleting it." };
  await (await col("tickets")).updateMany({ sprint_id: id }, { $set: { sprint_id: null } }); // back to the backlog
  await sprints.deleteOne({ _id: id as never });
  refresh();
  return {};
}
