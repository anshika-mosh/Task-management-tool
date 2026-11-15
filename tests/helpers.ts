import bcrypt from "bcryptjs";
import { expect } from "vitest";
import { col, getDb, nextId, now, today } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { cookieJar, revalidated, afterQueue, RedirectError } from "./mocks/state";

export { flushAfter, RedirectError, NotFoundError, cookieJar, revalidated } from "./mocks/state";

/** Wipe all data (indexes are kept) and reset session/mocks. Call in beforeEach. */
export async function resetData() {
  const db = await getDb();
  for (const c of await db.collections()) await c.deleteMany({});
  cookieJar.clear();
  revalidated.length = 0;
  afterQueue.length = 0;
}

export const fd = (fields: Record<string, string | number | null | undefined>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null) f.set(k, String(v));
  return f;
};

/* -------------------------------- factories -------------------------------- */
// Factories write straight to MongoDB so tests of one feature don't depend on another.

export type TestUser = { id: number; name: string; email: string; password: string; role: "admin" | "member" };
let seq = 0;

export async function makeUser(o: Partial<TestUser> = {}): Promise<TestUser> {
  const n = ++seq;
  const user = { name: `User ${n}`, email: `user${n}@test.dev`, password: "secret-pass", role: "member" as const, ...o };
  const id = await nextId("users");
  await (await col("users")).insertOne({
    _id: id as never, name: user.name, email: user.email.toLowerCase(), password_hash: bcrypt.hashSync(user.password, 4),
    role: user.role, color: "#2684ff", created_at: now(),
  });
  return { ...user, id };
}
export const makeAdmin = (o: Partial<TestUser> = {}) => makeUser({ role: "admin", name: "Admin", ...o });

export type TestBoard = { id: number; key: string; name: string };
export async function makeBoard(o: Partial<TestBoard> = {}): Promise<TestBoard> {
  const n = ++seq;
  const b = { key: `B${n}`.slice(0, 10), name: `Board ${n}`, ...o };
  const id = await nextId("boards");
  await (await col("boards")).insertOne({ _id: id as never, key: b.key, name: b.name, description: "", color: "#2684ff", counter: 0, created_at: now() });
  return { ...b, id };
}

export type TestTicket = { id: number; key: string; number: number; board_id: number };
export async function makeTicket(
  board: TestBoard,
  o: Partial<{ title: string; description: string; type: string; status: string; priority: string; assignee_id: number | null; reporter_id: number | null; progress: number; sprint_id: number | null; due_date: string | null; created_at: string }> = {},
): Promise<TestTicket> {
  const bumped = await (await col("boards")).findOneAndUpdate({ _id: board.id as never }, { $inc: { counter: 1 } }, { returnDocument: "after" });
  const number = bumped!.counter as number;
  const id = await nextId("tickets");
  const ts = o.created_at ?? now();
  await (await col("tickets")).insertOne({
    _id: id as never, board_id: board.id, number, title: o.title ?? `Ticket ${number}`, description: o.description ?? "", type: o.type ?? "task",
    status: o.status ?? "todo", priority: o.priority ?? "medium", assignee_id: o.assignee_id ?? null, reporter_id: o.reporter_id ?? null,
    progress: o.progress ?? 0, due_date: o.due_date ?? null, sprint_id: o.sprint_id ?? null, created_at: ts, updated_at: ts,
  });
  return { id, number, key: `${board.key}-${number}`, board_id: board.id };
}

export async function makeSprint(board: TestBoard, o: Partial<{ name: string; status: "planned" | "active" | "completed"; goal: string; start_date: string | null; end_date: string | null }> = {}) {
  const n = ++seq;
  const id = await nextId("sprints");
  await (await col("sprints")).insertOne({
    _id: id as never, board_id: board.id, name: o.name ?? `Sprint ${n}`, goal: o.goal ?? "", start_date: o.start_date ?? today(), end_date: o.end_date ?? today(14),
    status: o.status ?? "planned", completed_at: null, created_at: now(),
  });
  return { id, name: o.name ?? `Sprint ${n}` };
}

/* ---------------------------------- auth ----------------------------------- */

/** Make `user` the signed-in user for subsequent server-action / route calls. */
export async function loginAs(user: { id: number }) {
  cookieJar.clear();
  await createSession(user.id);
}
export const logoutNow = () => cookieJar.clear();

/** Assert that `fn` ends in a Next.js redirect to `url`. */
export async function expectRedirect(fn: () => Promise<unknown>, url: string) {
  const err = await fn().then(
    () => null,
    (e) => e,
  );
  expect(err, `expected a redirect to ${url}`).toBeInstanceOf(RedirectError);
  expect((err as RedirectError).url).toBe(url);
}

/* ---------------------------------- reads ---------------------------------- */

export const findAll = async (name: Parameters<typeof col>[0], filter: Record<string, unknown> = {}) => (await col(name)).find(filter).sort({ _id: 1 }).toArray();
export const findOne = async (name: Parameters<typeof col>[0], filter: Record<string, unknown>) => (await col(name)).findOne(filter);
export const count = async (name: Parameters<typeof col>[0], filter: Record<string, unknown> = {}) => (await col(name)).countDocuments(filter);
export const emails = () => findAll("emails");
