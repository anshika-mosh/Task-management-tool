import { col, toRow, toRows, type Doc } from "./db";
import type { Activity, Attachment, Board, BoardStats, Comment, EmailRow, Sprint, Ticket, User } from "./types";

const CI = { locale: "en", strength: 2 } as const; // case-insensitive ordering
const NO_PASSWORD = { projection: { password_hash: 0 } } as const;
const PRIORITY_RANK: Record<string, number> = { highest: 0, high: 1, medium: 2, low: 3, lowest: 4 };
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* -------------------------------- lookups -------------------------------- */

async function byId<T>(name: "users" | "boards" | "sprints" | "tickets", ids: (number | null | undefined)[]): Promise<Map<number, T>> {
  const unique = [...new Set(ids.filter((i): i is number => typeof i === "number"))];
  if (unique.length === 0) return new Map();
  const c = await col(name);
  const docs = await c.find({ _id: { $in: unique as never[] } }, name === "users" ? NO_PASSWORD : undefined).toArray();
  return new Map(docs.map((d) => [d._id as unknown as number, toRow<T>(d)!]));
}

export async function getUsers(): Promise<User[]> {
  const c = await col("users");
  return toRows<User>(await c.find({}, NO_PASSWORD).collation(CI).sort({ name: 1 }).toArray());
}

export async function getBoards(): Promise<Board[]> {
  const c = await col("boards");
  return toRows<Board>(await c.find({}).collation(CI).sort({ name: 1 }).toArray());
}

export async function getBoardByKey(key: string): Promise<Board | undefined> {
  const c = await col("boards");
  return toRow<Board>(await c.findOne({ key: key.toUpperCase() }));
}

export async function getBoardStats(): Promise<BoardStats[]> {
  const boards = await getBoards();
  const t = await col("tickets");
  const agg = await t.aggregate([{ $group: { _id: { b: "$board_id", s: "$status" }, n: { $sum: 1 }, p: { $sum: "$progress" } } }]).toArray();
  return boards.map((b) => {
    const s = { total: 0, todo: 0, in_progress: 0, in_review: 0, done: 0 };
    let progress = 0;
    for (const g of agg) {
      if (g._id.b !== b.id) continue;
      s.total += g.n;
      progress += g.p;
      if (g._id.s in s) s[g._id.s as "todo" | "in_progress" | "in_review" | "done"] += g.n;
    }
    return { ...b, ...s, avg_progress: s.total ? progress / s.total : 0 };
  });
}

/* --------------------------------- tickets -------------------------------- */

export type TicketFilter = { boardId?: number; q?: string; assignee?: string; status?: string; type?: string; priority?: string; mine?: number; sprint?: string };

/** Adds board/assignee/reporter/sprint names and comment/attachment/time counts to raw ticket documents. */
async function enrichTickets(docs: Doc[]): Promise<Ticket[]> {
  if (docs.length === 0) return [];
  const ids = docs.map((d) => d._id as number);
  const [boards, users, sprints, comments, attachments] = await Promise.all([
    byId<Board>("boards", docs.map((d) => d.board_id)),
    byId<User>("users", docs.flatMap((d) => [d.assignee_id, d.reporter_id])),
    byId<Sprint>("sprints", docs.map((d) => d.sprint_id)),
    col("comments").then((c) => c.aggregate([
      { $match: { ticket_id: { $in: ids } } },
      { $group: { _id: "$ticket_id", comments: { $sum: { $cond: [{ $eq: ["$kind", "comment"] }, 1, 0] } }, hours: { $sum: { $ifNull: ["$hours", 0] } } } },
    ]).toArray()),
    col("attachments").then((c) => c.aggregate([{ $match: { ticket_id: { $in: ids } } }, { $group: { _id: "$ticket_id", n: { $sum: 1 } } }]).toArray()),
  ]);
  const cm = new Map(comments.map((c) => [c._id as number, c]));
  const at = new Map(attachments.map((a) => [a._id as number, a.n as number]));
  return docs.map((d) => {
    const b = boards.get(d.board_id);
    const a = users.get(d.assignee_id);
    const r = users.get(d.reporter_id);
    const s = sprints.get(d.sprint_id);
    const stats = cm.get(d._id);
    return {
      ...(toRow<Ticket>(d) as Ticket),
      key: `${b?.key ?? "?"}-${d.number}`,
      board_key: b?.key ?? "?", board_name: b?.name ?? "", board_color: b?.color ?? "#2684ff",
      assignee_id: d.assignee_id ?? null, assignee_name: a?.name ?? null, assignee_color: a?.color ?? null,
      reporter_id: d.reporter_id ?? null, reporter_name: r?.name ?? null, reporter_color: r?.color ?? null,
      sprint_id: d.sprint_id ?? null, sprint_name: s?.name ?? null, sprint_status: s?.status ?? null,
      attach_count: at.get(d._id) ?? 0, comment_count: stats?.comments ?? 0, hours: stats?.hours ?? 0,
    };
  });
}

export async function getTickets(f: TicketFilter = {}): Promise<Ticket[]> {
  const and: Doc[] = [];
  if (f.boardId) and.push({ board_id: f.boardId });
  if (f.status) and.push({ status: f.status });
  if (f.type) and.push({ type: f.type });
  if (f.priority) and.push({ priority: f.priority });
  if (f.assignee === "none") and.push({ assignee_id: null });
  else if (f.assignee) and.push({ assignee_id: Number(f.assignee) });
  if (f.mine) and.push({ assignee_id: f.mine });
  if (f.sprint === "backlog") and.push({ sprint_id: null });
  else if (f.sprint) and.push({ sprint_id: Number(f.sprint) });
  if (f.q) {
    const re = new RegExp(escapeRe(f.q), "i");
    const or: Doc[] = [{ title: re }, { description: re }];
    // Partial ticket key, e.g. "WEB-3" or "web-"
    const km = /^([A-Za-z0-9]+)-(\d*)$/.exec(f.q.trim());
    if (km) {
      const boards = await (await col("boards")).find({ key: new RegExp("^" + escapeRe(km[1]), "i") }).toArray();
      for (const b of boards) or.push(km[2] ? { board_id: b._id, number: Number(km[2]) } : { board_id: b._id });
    }
    and.push({ $or: or });
  }
  const c = await col("tickets");
  const docs = await c.find(and.length ? { $and: and } : {}).toArray();
  const rows = await enrichTickets(docs);
  return rows.sort((a, b) => (PRIORITY_RANK[a.priority] ?? 5) - (PRIORITY_RANK[b.priority] ?? 5) || b.updated_at.localeCompare(a.updated_at));
}

export async function getTicketByKey(key: string): Promise<Ticket | undefined> {
  const m = /^([A-Za-z0-9]+)-(\d+)$/.exec(key);
  if (!m) return undefined;
  const board = await (await col("boards")).findOne({ key: m[1].toUpperCase() });
  if (!board) return undefined;
  const doc = await (await col("tickets")).findOne({ board_id: board._id, number: Number(m[2]) });
  return doc ? (await enrichTickets([doc]))[0] : undefined;
}

export async function getTicketById(id: number): Promise<Ticket | undefined> {
  const doc = await (await col("tickets")).findOne({ _id: id as never });
  return doc ? (await enrichTickets([doc]))[0] : undefined;
}

/* ------------------------- comments, files, activity ------------------------ */

export async function getComments(ticketId: number): Promise<Comment[]> {
  const docs = await (await col("comments")).find({ ticket_id: ticketId }).sort({ created_at: -1, _id: -1 }).toArray();
  const users = await byId<User>("users", docs.map((d) => d.user_id));
  return docs.map((d) => ({
    ...(toRow<Comment>(d) as Comment),
    progress: d.progress ?? null, hours: d.hours ?? null,
    user_name: users.get(d.user_id)?.name ?? "Deleted user", user_color: users.get(d.user_id)?.color ?? "#6b778c",
  }));
}

export async function getAttachments(ticketId: number): Promise<Attachment[]> {
  const docs = await (await col("attachments")).find({ ticket_id: ticketId }).sort({ _id: -1 }).toArray();
  const users = await byId<User>("users", docs.map((d) => d.user_id));
  return docs.map((d) => ({
    id: d._id, ticket_id: d.ticket_id, user_id: d.user_id, user_name: users.get(d.user_id)?.name ?? "Deleted user",
    filename: d.filename, mime: d.mime ?? "", size: d.size ?? 0, created_at: d.created_at,
    kind: d.kind ?? "file", link_type: d.link_type ?? null, url: d.url ?? null, drive_id: d.drive_id ?? null,
  }));
}

async function withActors(docs: Doc[], withTicket: boolean): Promise<Activity[]> {
  const users = await byId<User>("users", docs.map((d) => d.user_id));
  const tickets = withTicket ? await byId<{ id: number; board_id: number; number: number; title: string }>("tickets", docs.map((d) => d.ticket_id)) : new Map();
  const boards = withTicket ? await byId<Board>("boards", [...tickets.values()].map((t) => t.board_id)) : new Map();
  return docs.map((d) => {
    const t = tickets.get(d.ticket_id);
    return {
      ...(toRow<Activity>(d) as Activity),
      user_name: users.get(d.user_id)?.name ?? "Deleted user", user_color: users.get(d.user_id)?.color ?? "#6b778c",
      ...(t ? { ticket_key: `${boards.get(t.board_id)?.key ?? "?"}-${t.number}`, ticket_title: t.title } : {}),
    };
  });
}

export async function getTicketActivity(ticketId: number): Promise<Activity[]> {
  return withActors(await (await col("activity")).find({ ticket_id: ticketId }).sort({ _id: -1 }).toArray(), false);
}

export async function getRecentActivity(limit = 12): Promise<Activity[]> {
  return withActors(await (await col("activity")).find({}).sort({ _id: -1 }).limit(limit).toArray(), true);
}

/* --------------------------------- sprints -------------------------------- */

async function withSprintCounts(docs: Doc[]): Promise<Sprint[]> {
  if (docs.length === 0) return [];
  const agg = await (await col("tickets")).aggregate([
    { $match: { sprint_id: { $in: docs.map((d) => d._id) } } },
    { $group: { _id: "$sprint_id", total: { $sum: 1 }, done: { $sum: { $cond: [{ $eq: ["$status", "done"] }, 1, 0] } } } },
  ]).toArray();
  const m = new Map(agg.map((a) => [a._id as number, a]));
  return docs.map((d) => ({
    ...(toRow<Sprint>(d) as Sprint),
    start_date: d.start_date ?? null, end_date: d.end_date ?? null, completed_at: d.completed_at ?? null,
    total: m.get(d._id)?.total ?? 0, done: m.get(d._id)?.done ?? 0,
  }));
}

const SPRINT_RANK: Record<string, number> = { active: 0, planned: 1, completed: 2 };

export async function getSprints(boardId: number): Promise<Sprint[]> {
  const rows = await withSprintCounts(await (await col("sprints")).find({ board_id: boardId }).toArray());
  return rows.sort((a, b) => SPRINT_RANK[a.status] - SPRINT_RANK[b.status] || (a.start_date ?? "9999").localeCompare(b.start_date ?? "9999") || b.id - a.id);
}

export async function getSprint(id: number): Promise<Sprint | undefined> {
  const doc = await (await col("sprints")).findOne({ _id: id as never });
  return doc ? (await withSprintCounts([doc]))[0] : undefined;
}

/** Sprints that can still receive tickets (not completed), across all boards. */
export async function getOpenSprints(): Promise<Sprint[]> {
  const rows = await withSprintCounts(await (await col("sprints")).find({ status: { $ne: "completed" } }).toArray());
  return rows.sort((a, b) => (a.start_date ?? "9999").localeCompare(b.start_date ?? "9999") || a.id - b.id);
}

export async function getEmails(limit = 100): Promise<EmailRow[]> {
  return toRows<EmailRow>(await (await col("emails")).find({}).sort({ _id: -1 }).limit(limit).toArray());
}
