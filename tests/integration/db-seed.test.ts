import bcrypt from "bcryptjs";
import { MongoClient } from "mongodb";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/** Each test boots the data layer against its own brand-new database. */
const g = globalThis as unknown as { __tfClient?: Promise<MongoClient>; __tfReady?: Promise<unknown> };
const base = process.env.MONGODB_DB!;
const created: string[] = [];
let n = 0;

async function closeClient() {
  if (g.__tfClient) await (await g.__tfClient).close().catch(() => {});
  g.__tfClient = undefined;
  g.__tfReady = undefined;
}

async function freshDb(env: Record<string, string | undefined> = {}) {
  await closeClient();
  const name = `${base}_s${++n}`;
  created.push(name);
  process.env.MONGODB_DB = name;
  for (const [k, v] of Object.entries(env)) (v === undefined ? delete process.env[k] : (process.env[k] = v));
  vi.resetModules();
  return import("@/lib/db");
}

const DEFAULTS = { SEED_DEMO_DATA: "false", ADMIN_EMAIL: "seed-admin@test.dev", ADMIN_PASSWORD: "seed-admin-pass", ADMIN_NAME: "Seed Admin" };
beforeEach(() => {
  Object.assign(process.env, DEFAULTS);
});

afterAll(async () => {
  await closeClient();
  const c = new MongoClient(process.env.MONGODB_URI!);
  await c.connect();
  for (const name of created) await c.db(name).dropDatabase();
  await c.close();
});

describe("demo seed (SEED_DEMO_DATA=true)", () => {
  it("creates demo users, boards, sprints, tickets, history and a progress update", async () => {
    const { getDb } = await freshDb({ SEED_DEMO_DATA: "true" });
    const db = await getDb();
    const users = await db.collection("users").find().sort({ _id: 1 }).toArray();
    expect(users.map((u) => [u.email, u.role])).toEqual([["admin@taskflow.dev", "admin"], ["priya@taskflow.dev", "member"], ["alex@taskflow.dev", "member"]]);
    expect(bcrypt.compareSync("admin123", users[0].password_hash)).toBe(true);
    expect(bcrypt.compareSync("password", users[1].password_hash)).toBe(true);

    const boards = await db.collection("boards").find().sort({ _id: 1 }).toArray();
    expect(boards.map((b) => [b.key, b.counter])).toEqual([["WEB", 5], ["MOB", 3], ["OPS", 3]]);
    expect(await db.collection("tickets").countDocuments()).toBe(11);
    expect(await db.collection("activity").countDocuments({ action: "created" })).toBe(11);

    const sprints = await db.collection("sprints").find().toArray();
    expect(sprints).toHaveLength(3);
    expect(sprints.every((s) => s.status === "active")).toBe(true);
    expect(sprints.map((s) => s.name).sort()).toEqual(["MOB Sprint 1", "OPS Sprint 1", "WEB Sprint 1"]);
    // only each board's first three tickets are in its sprint; the rest are in the backlog
    expect(await db.collection("tickets").countDocuments({ sprint_id: { $ne: null } })).toBe(3 + 3 + 3);
    expect(await db.collection("tickets").countDocuments({ number: { $gt: 3 }, sprint_id: null })).toBe(2);

    const progress = await db.collection("comments").findOne({ kind: "progress" });
    expect(progress).toMatchObject({ progress: 55, hours: 6 });
  });

  it("leaves the id counters ready so the next ids don't collide", async () => {
    const { getDb, nextId } = await freshDb({ SEED_DEMO_DATA: "true" });
    await getDb();
    expect(await nextId("users")).toBe(4);
    expect(await nextId("tickets")).toBe(12);
    expect(await nextId("boards")).toBe(4);
  });

  it("is the default when SEED_DEMO_DATA is unset", async () => {
    const { getDb } = await freshDb({ SEED_DEMO_DATA: undefined });
    expect(await (await getDb()).collection("users").countDocuments()).toBe(3);
  });

  it("does not seed again on later starts", async () => {
    const first = await freshDb({ SEED_DEMO_DATA: "true" });
    await first.getDb();
    g.__tfReady = undefined; // simulate a restart: same database, new process
    vi.resetModules();
    const second = await import("@/lib/db");
    const db = await second.getDb();
    expect(await db.collection("users").countDocuments()).toBe(3);
    expect(await db.collection("tickets").countDocuments()).toBe(11);
  });
});

describe("production seed (SEED_DEMO_DATA=false)", () => {
  it("creates only the admin from the environment: no demo logins, boards or tickets", async () => {
    const { getDb } = await freshDb({ SEED_DEMO_DATA: "false", ADMIN_EMAIL: "Boss@Example.com", ADMIN_PASSWORD: "S3cret!pw", ADMIN_NAME: "The Boss" });
    const db = await getDb();
    const users = await db.collection("users").find().toArray();
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ name: "The Boss", email: "boss@example.com", role: "admin" });
    expect(bcrypt.compareSync("S3cret!pw", users[0].password_hash)).toBe(true);
    expect(await db.collection("boards").countDocuments()).toBe(0);
    expect(await db.collection("tickets").countDocuments()).toBe(0);
    expect(await db.collection("users").countDocuments({ email: "admin@taskflow.dev" })).toBe(0);
  });

  it("defaults the admin's name to Admin", async () => {
    const { getDb } = await freshDb({ ADMIN_NAME: undefined });
    expect((await (await getDb()).collection("users").findOne({}))?.name).toBe("Admin");
  });

  it("fails loudly without admin credentials, and works once they are provided (no half-seeded state)", async () => {
    const { getDb } = await freshDb({ ADMIN_EMAIL: undefined, ADMIN_PASSWORD: undefined });
    await expect(getDb()).rejects.toThrow(/ADMIN_EMAIL and ADMIN_PASSWORD/);

    process.env.ADMIN_EMAIL = "fixed@example.com";
    process.env.ADMIN_PASSWORD = "now-set-123";
    const db = await getDb(); // same module: the failed attempt must not be cached
    expect(await db.collection("users").countDocuments()).toBe(1);
  });

  it("a restart with existing users never creates a second admin", async () => {
    const first = await freshDb();
    await first.getDb();
    g.__tfReady = undefined;
    vi.resetModules();
    process.env.ADMIN_EMAIL = "someone-else@example.com";
    const db = await (await import("@/lib/db")).getDb();
    expect(await db.collection("users").countDocuments()).toBe(1);
  });
});

describe("concurrent startup", () => {
  it.each([
    ["production seed", { SEED_DEMO_DATA: "false" }, 1],
    ["demo seed", { SEED_DEMO_DATA: "true" }, 3],
  ])("two app instances starting together seed exactly once (%s)", async (_label, env, expectedUsers) => {
    const a = await freshDb(env);
    const pa = a.getDb();
    g.__tfReady = undefined; // a second instance: its own init, same shared database
    vi.resetModules();
    const b = await import("@/lib/db");
    const pb = b.getDb();
    const [dbA] = await Promise.all([pa, pb]);
    expect(await dbA.collection("users").countDocuments()).toBe(expectedUsers);
    if (expectedUsers === 3) expect(await dbA.collection("boards").countDocuments()).toBe(3);
  });
});

describe("indexes (data integrity enforced by the database)", () => {
  it("users.email is unique", async () => {
    const { col, getDb } = await freshDb();
    await getDb();
    await expect((await col("users")).insertOne({ _id: 900 as never, email: "seed-admin@test.dev" })).rejects.toMatchObject({ code: 11000 });
  });

  it("boards.key is unique", async () => {
    const { col } = await freshDb();
    const boards = await col("boards");
    await boards.insertOne({ _id: 1 as never, key: "WEB" });
    await expect(boards.insertOne({ _id: 2 as never, key: "WEB" })).rejects.toMatchObject({ code: 11000 });
  });

  it("(board_id, number) is unique so a ticket key can never be duplicated", async () => {
    const { col } = await freshDb();
    const tickets = await col("tickets");
    await tickets.insertOne({ _id: 1 as never, board_id: 1, number: 1 });
    await expect(tickets.insertOne({ _id: 2 as never, board_id: 1, number: 1 })).rejects.toMatchObject({ code: 11000 });
    await expect(tickets.insertOne({ _id: 3 as never, board_id: 2, number: 1 })).resolves.toBeTruthy();
  });
});

describe("helpers", () => {
  it("nextId hands out 1,2,3… per collection, and is unique under concurrency", async () => {
    const { nextId } = await freshDb();
    expect([await nextId("x"), await nextId("x"), await nextId("y")]).toEqual([1, 2, 1]);
    const ids = await Promise.all(Array.from({ length: 40 }, () => nextId("race")));
    expect(new Set(ids).size).toBe(40);
    expect(Math.min(...ids)).toBe(1);
    expect(Math.max(...ids)).toBe(40);
  });

  it("nextId survives the first-use upsert race on a brand-new counter", async () => {
    const { nextId, getDb } = await freshDb();
    await getDb();
    const ids = await Promise.all(Array.from({ length: 12 }, () => nextId("fresh-counter")));
    expect(new Set(ids).size).toBe(12);
  });

  it("toRow / toRows expose _id as id", async () => {
    const { toRow, toRows } = await freshDb();
    expect(toRow({ _id: 5, a: 1 })).toEqual({ id: 5, a: 1 });
    expect(toRow(null)).toBeUndefined();
    expect(toRows([{ _id: 1, x: 1 }, { _id: 2, x: 2 }])).toEqual([{ id: 1, x: 1 }, { id: 2, x: 2 }]);
  });

  it("now() is ISO-8601 and today() is YYYY-MM-DD, with offsets", async () => {
    const { now, today } = await freshDb();
    expect(now()).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    expect(today()).toMatch(/^\d{4}-\d\d-\d\d$/);
    expect(today(1) > today(0)).toBe(true);
    expect(today(-1) < today(0)).toBe(true);
  });
});

describe("configuration errors", () => {
  it("explains what to do when MONGODB_URI is missing, and recovers once it is set", async () => {
    const uri = process.env.MONGODB_URI!;
    const { getDb } = await freshDb();
    delete process.env.MONGODB_URI;
    await expect(getDb()).rejects.toThrow(/MONGODB_URI is not set.*\.env\.local/);
    process.env.MONGODB_URI = uri;
    await expect(getDb()).resolves.toBeTruthy();
  });

  it("uploads are disabled unless ALLOW_FILE_UPLOADS=true", async () => {
    const { uploadsEnabled } = await freshDb();
    delete process.env.ALLOW_FILE_UPLOADS;
    expect(uploadsEnabled()).toBe(false);
    process.env.ALLOW_FILE_UPLOADS = "false";
    expect(uploadsEnabled()).toBe(false);
    process.env.ALLOW_FILE_UPLOADS = "true";
    expect(uploadsEnabled()).toBe(true);
    delete process.env.ALLOW_FILE_UPLOADS;
  });
});
