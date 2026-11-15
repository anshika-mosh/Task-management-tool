import { all, get } from "./db";
import type { Activity, Attachment, Board, BoardStats, Comment, Ticket, User } from "./types";

const TICKET_SELECT = `
SELECT t.*, b.key AS board_key, b.name AS board_name, b.color AS board_color,
  b.key || '-' || t.number AS key,
  a.name AS assignee_name, a.color AS assignee_color,
  r.name AS reporter_name, r.color AS reporter_color,
  (SELECT COUNT(*) FROM attachments x WHERE x.ticket_id = t.id) AS attach_count,
  (SELECT COUNT(*) FROM comments c WHERE c.ticket_id = t.id AND c.kind = 'comment') AS comment_count,
  (SELECT COALESCE(SUM(hours),0) FROM comments c WHERE c.ticket_id = t.id) AS hours
FROM tickets t
JOIN boards b ON b.id = t.board_id
LEFT JOIN users a ON a.id = t.assignee_id
LEFT JOIN users r ON r.id = t.reporter_id`;

export const getUsers = () =>
  all<User>("SELECT id,name,email,role,color,created_at FROM users ORDER BY name COLLATE NOCASE");

export const getBoards = () => all<Board>("SELECT * FROM boards ORDER BY name COLLATE NOCASE");

export const getBoardByKey = (key: string) => get<Board>("SELECT * FROM boards WHERE key = ?", key.toUpperCase());

export const getBoardStats = () =>
  all<BoardStats>(`
SELECT b.*, COUNT(t.id) AS total,
  COALESCE(SUM(t.status='todo'),0) AS todo,
  COALESCE(SUM(t.status='in_progress'),0) AS in_progress,
  COALESCE(SUM(t.status='in_review'),0) AS in_review,
  COALESCE(SUM(t.status='done'),0) AS done,
  COALESCE(AVG(t.progress),0) AS avg_progress
FROM boards b LEFT JOIN tickets t ON t.board_id = b.id
GROUP BY b.id ORDER BY b.name COLLATE NOCASE`);

export type TicketFilter = { boardId?: number; q?: string; assignee?: string; status?: string; type?: string; priority?: string; mine?: number };

export function getTickets(f: TicketFilter = {}): Ticket[] {
  const where: string[] = [];
  const p: (string | number)[] = [];
  if (f.boardId) { where.push("t.board_id = ?"); p.push(f.boardId); }
  if (f.status) { where.push("t.status = ?"); p.push(f.status); }
  if (f.type) { where.push("t.type = ?"); p.push(f.type); }
  if (f.priority) { where.push("t.priority = ?"); p.push(f.priority); }
  if (f.assignee === "none") where.push("t.assignee_id IS NULL");
  else if (f.assignee) { where.push("t.assignee_id = ?"); p.push(Number(f.assignee)); }
  if (f.mine) { where.push("t.assignee_id = ?"); p.push(f.mine); }
  if (f.q) {
    where.push("(t.title LIKE ? OR t.description LIKE ? OR (b.key || '-' || t.number) LIKE ?)");
    const like = `%${f.q}%`;
    p.push(like, like, like);
  }
  const sql = `${TICKET_SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY CASE t.priority WHEN 'highest' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END, t.updated_at DESC`;
  return all<Ticket>(sql, ...p);
}

export function getTicketByKey(key: string): Ticket | undefined {
  const m = /^([A-Za-z0-9]+)-(\d+)$/.exec(key);
  if (!m) return undefined;
  return get<Ticket>(`${TICKET_SELECT} WHERE b.key = ? AND t.number = ?`, m[1].toUpperCase(), Number(m[2]));
}

export const getTicketById = (id: number) => get<Ticket>(`${TICKET_SELECT} WHERE t.id = ?`, id);

export const getComments = (ticketId: number) =>
  all<Comment>(
    `SELECT c.*, u.name AS user_name, u.color AS user_color FROM comments c JOIN users u ON u.id = c.user_id
     WHERE c.ticket_id = ? ORDER BY c.created_at DESC, c.id DESC`,
    ticketId,
  );

export const getAttachments = (ticketId: number) =>
  all<Attachment>(
    `SELECT a.id,a.ticket_id,a.user_id,a.filename,a.mime,a.size,a.created_at, u.name AS user_name
     FROM attachments a JOIN users u ON u.id = a.user_id WHERE a.ticket_id = ? ORDER BY a.id DESC`,
    ticketId,
  );

const ACT_SELECT = `SELECT a.*, u.name AS user_name, u.color AS user_color, b.key || '-' || t.number AS ticket_key, t.title AS ticket_title
  FROM activity a JOIN users u ON u.id = a.user_id JOIN tickets t ON t.id = a.ticket_id JOIN boards b ON b.id = t.board_id`;

export const getTicketActivity = (ticketId: number) =>
  all<Activity>(`${ACT_SELECT} WHERE a.ticket_id = ? ORDER BY a.id DESC`, ticketId);

export const getRecentActivity = (limit = 12) =>
  all<Activity>(`${ACT_SELECT} ORDER BY a.id DESC LIMIT ?`, limit);

export const getBoardActivity = (boardId: number, limit = 8) =>
  all<Activity>(`${ACT_SELECT} WHERE t.board_id = ? ORDER BY a.id DESC LIMIT ?`, boardId, limit);
