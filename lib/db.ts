import { MongoClient, type Collection, type Db, type Document } from "mongodb";
import path from "node:path";
import bcrypt from "bcryptjs";

/**
 * MongoDB data layer.
 *  - Every document keeps a numeric `_id` (allocated from the `counters` collection) so ids stay small
 *    plain numbers in URLs, props and the UI. `toRow()` exposes it as `id`.
 *  - Timestamps are ISO-8601 strings, dates (due/sprint) are "YYYY-MM-DD" strings.
 *  - No multi-document transactions are used, so this works on a standalone mongod, a replica set and Atlas.
 */

// Local-disk uploads (optional; images/videos are normally Google Drive links).
export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), ".data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
export const uploadsEnabled = () => process.env.ALLOW_FILE_UPLOADS === "true";

export type CollName = "users" | "boards" | "tickets" | "comments" | "attachments" | "activity" | "sprints" | "emails" | "counters" | "meta";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Doc = Record<string, any>;
/** What every collection stores: a numeric _id plus free-form fields. */
export type Stored = { _id: number } & Doc;

const g = globalThis as unknown as { __tfClient?: Promise<MongoClient>; __tfReady?: Promise<Db> };

function client(): Promise<MongoClient> {
  return (g.__tfClient ??= (async () => {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is not set. Copy .env.example to .env.local, fill it in and restart.");
    const c = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
    await c.connect();
    return c;
  })().catch((e) => {
    g.__tfClient = undefined; // allow a retry after fixing the config
    throw e;
  }));
}

/** Connects once, creates indexes and seeds first-run data. */
export function getDb(): Promise<Db> {
  return (g.__tfReady ??= (async () => {
    const db = (await client()).db(process.env.MONGODB_DB || "taskflow");
    await ensureIndexes(db);
    await seedIfEmpty(db);
    return db;
  })().catch((e) => {
    g.__tfReady = undefined;
    throw e;
  }));
}

export async function col(name: CollName): Promise<Collection<Stored>> {
  return (await getDb()).collection<Stored>(name);
}

export const now = () => new Date().toISOString();
export const today = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);

/** `{_id, ...rest}` -> `{id, ...rest}` */
export function toRow<T>(d: Doc | null | undefined): T | undefined {
  if (!d) return undefined;
  const { _id, ...rest } = d;
  return { id: _id, ...rest } as T;
}
export const toRows = <T>(ds: Doc[]): T[] => ds.map((d) => toRow<T>(d)!);

/** Atomically allocate the next numeric id for a collection. */
export async function nextId(name: string): Promise<number> {
  const counters = await col("counters");
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await counters.findOneAndUpdate({ _id: name as never }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after" });
      return r!.seq as number;
    } catch (e) {
      // Two first-time upserts can race on the same _id; the retry then finds the document.
      if (attempt >= 3 || (e as { code?: number }).code !== 11000) throw e;
    }
  }
}

async function ensureIndexes(db: Db) {
  await Promise.all([
    db.collection("users").createIndex({ email: 1 }, { unique: true }),
    db.collection("boards").createIndex({ key: 1 }, { unique: true }),
    db.collection("tickets").createIndex({ board_id: 1, number: 1 }, { unique: true }),
    db.collection("tickets").createIndex({ assignee_id: 1 }),
    db.collection("tickets").createIndex({ sprint_id: 1 }),
    db.collection("comments").createIndex({ ticket_id: 1, created_at: -1 }),
    db.collection("attachments").createIndex({ ticket_id: 1 }),
    db.collection("activity").createIndex({ ticket_id: 1, _id: -1 }),
    db.collection("sprints").createIndex({ board_id: 1 }),
  ]);
}

/* ------------------------------ first-run seed ----------------------------- */

async function seedIfEmpty(db: Db) {
  if ((await db.collection("users").estimatedDocumentCount()) > 0) return;
  // Only one process may seed (e.g. several workers starting together).
  try {
    await db.collection("meta").insertOne({ _id: "seeded" as never, at: now() });
  } catch {
    return;
  }
  const idFor = async (name: string) => {
    const r = await db.collection("counters").findOneAndUpdate({ _id: name as never }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after" });
    return r!.seq as number;
  };
  const demo = process.env.SEED_DEMO_DATA !== "false";
  const hash = (p: string) => bcrypt.hashSync(p, 10);
  const ts = now();

  const user = async (name: string, email: string, password: string, role: string, color: string) => {
    const id = await idFor("users");
    await db.collection("users").insertOne({ _id: id as never, name, email: email.toLowerCase(), password_hash: hash(password), role, color, created_at: ts });
    return id;
  };

  if (!demo) {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) {
      await db.collection("meta").deleteOne({ _id: "seeded" as never });
      throw new Error("SEED_DEMO_DATA=false needs ADMIN_EMAIL and ADMIN_PASSWORD in .env.local to create the first admin.");
    }
    await user(process.env.ADMIN_NAME || "Admin", email, password, "admin", "#6554c0");
    return;
  }

  const admin = await user("Admin", "admin@taskflow.dev", "admin123", "admin", "#6554c0");
  const priya = await user("Priya Sharma", "priya@taskflow.dev", "password", "member", "#36b37e");
  const alex = await user("Alex Morgan", "alex@taskflow.dev", "password", "member", "#ff991f");
  const people = [admin, priya, alex];

  const boards: Record<string, number> = {};
  const addBoard = async (key: string, name: string, description: string, color: string) => {
    const id = await idFor("boards");
    boards[key] = id;
    await db.collection("boards").insertOne({ _id: id as never, key, name, description, color, counter: 0, created_at: ts });
  };
  await addBoard("WEB", "Website Team", "Marketing site, docs and web platform.", "#2684ff");
  await addBoard("MOB", "Mobile App", "iOS and Android releases.", "#36b37e");
  await addBoard("OPS", "Infrastructure", "Cloud, CI/CD and reliability.", "#ff5630");

  // board, title, type, status, priority, description, assignee (1-based into people), progress
  const rows: [string, string, string, string, string, string, number, number][] = [
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
  const sprintOf: Record<string, number> = {};
  for (const key of Object.keys(boards)) {
    const sid = await idFor("sprints");
    sprintOf[key] = sid;
    await db.collection("sprints").insertOne({
      _id: sid as never, board_id: boards[key], name: `${key} Sprint 1`, goal: "Ship the first milestone.",
      start_date: today(-3), end_date: today(11), status: "active", completed_at: null, created_at: ts,
    });
  }
  const firstTicket: number[] = [];
  for (const [key, title, type, status, priority, description, who, progress] of rows) {
    const board = await db.collection("boards").findOneAndUpdate({ _id: boards[key] as never }, { $inc: { counter: 1 } }, { returnDocument: "after" });
    const number = board!.counter as number;
    const id = await idFor("tickets");
    if (firstTicket.length === 0) firstTicket.push(id);
    await db.collection("tickets").insertOne({
      _id: id as never, board_id: boards[key], number, title, description, type, status, priority,
      assignee_id: people[who - 1], reporter_id: admin, progress, due_date: null,
      sprint_id: number <= 3 ? sprintOf[key] : null, created_at: ts, updated_at: ts,
    });
    await db.collection("activity").insertOne({ _id: (await idFor("activity")) as never, ticket_id: id, user_id: admin, action: "created", field: null, old_value: null, new_value: null, created_at: ts });
  }
  await db.collection("comments").insertOne({
    _id: (await idFor("comments")) as never, ticket_id: firstTicket[0], user_id: priya, body: "Wireframes approved, starting the comparison table.",
    kind: "progress", progress: 55, hours: 6, created_at: ts,
  });
}

export type { Document };
