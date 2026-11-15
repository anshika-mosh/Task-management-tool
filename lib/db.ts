import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), ".data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  color TEXT NOT NULL DEFAULT '#2684ff',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS boards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#2684ff',
  counter INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'task',
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT NOT NULL DEFAULT 'medium',
  assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reporter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  due_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(board_id, number)
);
CREATE INDEX IF NOT EXISTS idx_tickets_board ON tickets(board_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assignee ON tickets(assignee_id);
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'comment',
  progress INTEGER,
  hours REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_comments_ticket ON comments(ticket_id);
CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_attachments_ticket ON attachments(ticket_id);
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  field TEXT,
  old_value TEXT,
  new_value TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_ticket ON activity(ticket_id);
`;

function init(): DatabaseSync {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const d = new DatabaseSync(path.join(DATA_DIR, "taskflow.db"));
  d.exec("PRAGMA busy_timeout = 15000;"); // first, so concurrent build workers wait instead of failing
  d.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  d.exec(SCHEMA);
  d.exec("BEGIN IMMEDIATE");
  try { seed(d); d.exec("COMMIT"); } catch (e) { d.exec("ROLLBACK"); throw e; }
  return d;
}

/** First-run demo data: an admin, two teammates, three team boards with tickets. */
function seed(d: DatabaseSync) {
  const count = (d.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number }).c;
  if (count > 0) return;
  const hash = (p: string) => bcrypt.hashSync(p, 10);
  const addUser = d.prepare("INSERT OR IGNORE INTO users (name,email,password_hash,role,color) VALUES (?,?,?,?,?)");
  addUser.run("Admin", "admin@taskflow.dev", hash("admin123"), "admin", "#6554c0");
  addUser.run("Priya Sharma", "priya@taskflow.dev", hash("password"), "member", "#36b37e");
  addUser.run("Alex Morgan", "alex@taskflow.dev", hash("password"), "member", "#ff991f");

  const addBoard = d.prepare("INSERT OR IGNORE INTO boards (key,name,description,color) VALUES (?,?,?,?)");
  addBoard.run("WEB", "Website Team", "Marketing site, docs and web platform.", "#2684ff");
  addBoard.run("MOB", "Mobile App", "iOS and Android releases.", "#36b37e");
  addBoard.run("OPS", "Infrastructure", "Cloud, CI/CD and reliability.", "#ff5630");

  const demo: [string, string, string, string, string, string, number, number][] = [
    // board, title, type, status, priority, description, assignee, progress
    ["WEB", "Redesign the pricing page", "story", "in_progress", "high", "New layout with comparison table and FAQ section.", 2, 55],
    ["WEB", "Fix broken image on /about in Safari", "bug", "todo", "medium", "Hero image renders at 0px height on Safari 17.", 3, 0],
    ["WEB", "Add dark mode to docs", "task", "in_review", "low", "Respect prefers-color-scheme.", 2, 90],
    ["WEB", "Migrate blog to MDX", "epic", "todo", "medium", "Move all posts from CMS export to MDX files.", 1, 0],
    ["WEB", "Lighthouse score above 95", "task", "done", "high", "Performance budget on the landing page.", 3, 100],
    ["MOB", "Push notification opt-in flow", "story", "in_progress", "highest", "Ask for permission after first successful task.", 3, 40],
    ["MOB", "App crashes on launch on Android 12", "bug", "in_review", "highest", "Null pointer in splash screen initialiser.", 2, 80],
    ["MOB", "Biometric login", "story", "todo", "medium", "FaceID / fingerprint as optional second factor.", 1, 0],
    ["OPS", "Set up staging autoscaling", "task", "in_progress", "high", "Scale 2-8 pods on CPU > 65%.", 3, 30],
    ["OPS", "Rotate database credentials", "task", "todo", "highest", "Quarterly rotation; update secrets manager.", 1, 0],
    ["OPS", "Cut CI time below 8 minutes", "story", "done", "medium", "Cache dependencies and parallelise test shards.", 2, 100],
  ];
  const board = d.prepare("SELECT id FROM boards WHERE key = ?");
  const bump = d.prepare("UPDATE boards SET counter = counter + 1 WHERE id = ? RETURNING counter");
  const addTicket = d.prepare(
    "INSERT INTO tickets (board_id,number,title,description,type,status,priority,assignee_id,reporter_id,progress) VALUES (?,?,?,?,?,?,?,?,1,?)",
  );
  const addAct = d.prepare("INSERT INTO activity (ticket_id,user_id,action) VALUES (?,1,'created')");
  for (const [key, title, type, status, priority, desc, assignee, progress] of demo) {
    const b = board.get(key) as { id: number };
    const n = (bump.get(b.id) as { counter: number }).counter;
    const r = addTicket.run(b.id, n, title, desc, type, status, priority, assignee, progress);
    addAct.run(Number(r.lastInsertRowid));
  }
  d.prepare(
    "INSERT INTO comments (ticket_id,user_id,body,kind,progress,hours) VALUES (1,2,'Wireframes approved, starting the comparison table.','progress',55,6)",
  ).run();
}

const g = globalThis as unknown as { __taskflowDb?: DatabaseSync };
export const db: DatabaseSync = (g.__taskflowDb ??= init());

type P = string | number | null | undefined;
const clean = (p: P[]) => p.map((v) => (v === undefined ? null : v));

export function all<T = Record<string, unknown>>(sql: string, ...p: P[]): T[] {
  return db.prepare(sql).all(...clean(p)).map((r) => ({ ...r })) as T[];
}
export function get<T = Record<string, unknown>>(sql: string, ...p: P[]): T | undefined {
  const r = db.prepare(sql).get(...clean(p));
  return r ? ({ ...r } as T) : undefined;
}
export function run(sql: string, ...p: P[]) {
  return db.prepare(sql).run(...clean(p));
}
export function tx<T>(fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
