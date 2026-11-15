import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MongoClient } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const script = path.join(root, "scripts", "migrate-sqlite-to-mongo.mjs");
const uri = process.env.MONGODB_URI!;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tf-migrate-"));
const dbs: string[] = [];
let client: MongoClient;

beforeAll(async () => {
  client = new MongoClient(uri);
  await client.connect();
});
afterAll(async () => {
  for (const d of dbs) await client.db(d).dropDatabase();
  await client.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** Builds a SQLite database like the one the previous (SQLite) version of the app produced. */
function makeSqlite(file: string, opts: { sprints: boolean }) {
  const code = `
    const { DatabaseSync } = require("node:sqlite");
    const d = new DatabaseSync(process.argv[1]);
    d.exec(\`
      CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT, password_hash TEXT, role TEXT, color TEXT, created_at TEXT);
      CREATE TABLE boards (id INTEGER PRIMARY KEY, key TEXT, name TEXT, description TEXT, color TEXT, counter INTEGER, created_at TEXT);
      CREATE TABLE tickets (id INTEGER PRIMARY KEY, board_id INTEGER, number INTEGER, title TEXT, description TEXT, type TEXT, status TEXT, priority TEXT,
        assignee_id INTEGER, reporter_id INTEGER, progress INTEGER, due_date TEXT, created_at TEXT, updated_at TEXT ${opts.sprints ? ", sprint_id INTEGER" : ""});
      CREATE TABLE comments (id INTEGER PRIMARY KEY, ticket_id INTEGER, user_id INTEGER, body TEXT, kind TEXT, progress INTEGER, hours REAL, created_at TEXT);
      CREATE TABLE attachments (id INTEGER PRIMARY KEY, ticket_id INTEGER, user_id INTEGER, filename TEXT, stored_name TEXT, mime TEXT, size INTEGER, created_at TEXT);
      CREATE TABLE activity (id INTEGER PRIMARY KEY, ticket_id INTEGER, user_id INTEGER, action TEXT, field TEXT, old_value TEXT, new_value TEXT, created_at TEXT);
      ${opts.sprints ? `CREATE TABLE sprints (id INTEGER PRIMARY KEY, board_id INTEGER, name TEXT, goal TEXT, start_date TEXT, end_date TEXT, status TEXT, completed_at TEXT, created_at TEXT);
      CREATE TABLE emails (id INTEGER PRIMARY KEY, to_email TEXT, to_name TEXT, subject TEXT, html TEXT, ticket_key TEXT, status TEXT, error TEXT, created_at TEXT);` : ""}
      INSERT INTO users VALUES (1,'Admin','admin@x.dev','hash1','admin','#111111','2026-01-02 03:04:05'), (7,'Bob','bob@x.dev','hash2','member','#222222','2026-01-03 00:00:00');
      INSERT INTO boards VALUES (1,'WEB','Web','desc','#2684ff',12,'2026-01-02 03:04:05'), (4,'MOB','Mobile','','#36b37e',3,'2026-01-02 03:04:05');
      INSERT INTO tickets (id,board_id,number,title,description,type,status,priority,assignee_id,reporter_id,progress,due_date,created_at,updated_at ${opts.sprints ? ",sprint_id" : ""})
        VALUES (5,1,12,'Old ticket','d','bug','done','high',7,1,100,'2026-02-01','2026-01-05 10:00:00','2026-01-06 11:30:00' ${opts.sprints ? ",2" : ""}),
               (9,4,3,'Other','','task','todo','low',NULL,1,0,NULL,'2026-01-05 10:00:00','2026-01-05 10:00:00' ${opts.sprints ? ",NULL" : ""});
      INSERT INTO comments VALUES (3,5,7,'a note','progress',60,2.5,'2026-01-05 12:00:00');
      INSERT INTO attachments VALUES (2,5,1,'shot.png','uuid.png','image/png',1234,'2026-01-05 12:00:00');
      INSERT INTO activity VALUES (11,5,1,'created',NULL,NULL,NULL,'2026-01-05 10:00:00'), (14,5,7,'changed','Status','todo','done','2026-01-06 11:30:00');
      ${opts.sprints ? `INSERT INTO sprints VALUES (2,1,'WEB Sprint 1','goal','2026-01-01','2026-01-14','completed','2026-01-15 09:00:00','2026-01-01 00:00:00');
      INSERT INTO emails VALUES (6,'bob@x.dev','Bob','subj','<p>hi</p>','WEB-12','logged',NULL,'2026-01-06 11:31:00');` : ""}
    \`);
  `;
  const r = spawnSync(process.execPath, ["-e", code, file], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`could not build sqlite fixture: ${r.stderr}`);
}

function migrate(args: string[], env: Record<string, string | undefined>) {
  return spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: "utf8", env: { ...process.env, ...env } });
}
const newDb = () => {
  const name = `${process.env.MONGODB_DB}_mig${dbs.length}`;
  dbs.push(name);
  return name;
};

describe("scripts/migrate-sqlite-to-mongo.mjs", () => {
  it("copies every table, preserving ids, converting timestamps to ISO and setting id counters", async () => {
    const file = path.join(tmp, "full.db");
    makeSqlite(file, { sprints: true });
    const dbName = newDb();
    const r = migrate([file], { MONGODB_URI: uri, MONGODB_DB: dbName });
    expect(r.status, r.stderr + r.stdout).toBe(0);
    expect(r.stdout).toMatch(/users\s+2/);
    expect(r.stdout).toMatch(/tickets\s+2/);

    const db = client.db(dbName);
    expect(await db.collection("users").find().sort({ _id: 1 }).toArray()).toMatchObject([
      { _id: 1, name: "Admin", email: "admin@x.dev", password_hash: "hash1", role: "admin", created_at: "2026-01-02T03:04:05.000Z" },
      { _id: 7, name: "Bob", role: "member" },
    ]);
    expect(await db.collection("boards").findOne({ key: "WEB" })).toMatchObject({ _id: 1, counter: 12 }); // counter preserved => next ticket is WEB-13
    expect(await db.collection("tickets").findOne({ _id: 5 as never })).toMatchObject({
      board_id: 1, number: 12, title: "Old ticket", status: "done", assignee_id: 7, reporter_id: 1, progress: 100, due_date: "2026-02-01",
      sprint_id: 2, created_at: "2026-01-05T10:00:00.000Z", updated_at: "2026-01-06T11:30:00.000Z",
    });
    expect(await db.collection("tickets").findOne({ _id: 9 as never })).toMatchObject({ assignee_id: null, sprint_id: null });
    expect(await db.collection("comments").findOne({})).toMatchObject({ _id: 3, kind: "progress", progress: 60, hours: 2.5 });
    expect(await db.collection("attachments").findOne({})).toMatchObject({ _id: 2, kind: "file", stored_name: "uuid.png", link_type: null, url: null, drive_id: null, size: 1234 });
    expect(await db.collection("activity").countDocuments()).toBe(2);
    expect(await db.collection("sprints").findOne({})).toMatchObject({ _id: 2, status: "completed", completed_at: "2026-01-15T09:00:00.000Z" });
    expect(await db.collection("emails").findOne({})).toMatchObject({ _id: 6, ticket_key: "WEB-12", status: "logged" });

    const counters = Object.fromEntries((await db.collection("counters").find().toArray()).map((c) => [c._id, c.seq]));
    expect(counters).toMatchObject({ users: 7, boards: 4, tickets: 9, comments: 3, attachments: 2, activity: 14, sprints: 2, emails: 6 });
    expect(await db.collection("meta").findOne({ _id: "seeded" as never })).toBeTruthy(); // so the app won't seed demo data on top
  });

  it("migrates an older SQLite file that has no sprints/emails tables or sprint_id column", async () => {
    const file = path.join(tmp, "old.db");
    makeSqlite(file, { sprints: false });
    const dbName = newDb();
    const r = migrate([file], { MONGODB_URI: uri, MONGODB_DB: dbName });
    expect(r.status, r.stderr).toBe(0);
    const db = client.db(dbName);
    expect(await db.collection("tickets").countDocuments()).toBe(2);
    expect((await db.collection("tickets").findOne({ _id: 5 as never }))?.sprint_id).toBeNull();
    expect(await db.collection("sprints").countDocuments()).toBe(0);
  });

  it("refuses to run against a database that already has users (cannot overwrite live data)", async () => {
    const file = path.join(tmp, "guard.db");
    makeSqlite(file, { sprints: true });
    const dbName = newDb();
    await client.db(dbName).collection("users").insertOne({ _id: 1 as never, email: "existing@x.dev" });
    const r = migrate([file], { MONGODB_URI: uri, MONGODB_DB: dbName });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/already contains users/);
    expect(await client.db(dbName).collection("users").countDocuments()).toBe(1);
    expect(await client.db(dbName).collection("tickets").countDocuments()).toBe(0);
  });

  it("fails with clear messages for a missing SQLite file or MONGODB_URI", () => {
    const missing = migrate([path.join(tmp, "nope.db")], { MONGODB_URI: uri, MONGODB_DB: newDb() });
    expect(missing.status).toBe(1);
    expect(missing.stderr).toMatch(/SQLite file not found/);
    const noUri = migrate([path.join(tmp, "full.db")], { MONGODB_URI: "" });
    expect(noUri.status).toBe(1);
    expect(noUri.stderr).toMatch(/MONGODB_URI is not set/);
  });
});
