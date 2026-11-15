// One-off: copy an existing SQLite database (.data/taskflow.db) into MongoDB.
//
//   node --env-file=.env.local scripts/migrate-sqlite-to-mongo.mjs [path/to/taskflow.db]
//
// Ids are preserved, so ticket keys (WEB-12), URLs and uploaded-file references keep working.
// Files uploaded earlier stay on disk in .data/uploads and keep being served. Refuses to run
// if the target Mongo database already has users (so it can't overwrite live data).
import { DatabaseSync } from "node:sqlite";
import { MongoClient } from "mongodb";
import fs from "node:fs";
import path from "node:path";

const uri = process.env.MONGODB_URI;
if (!uri) { console.error("MONGODB_URI is not set (use --env-file=.env.local)."); process.exit(1); }
const dbName = process.env.MONGODB_DB || "taskflow";
const file = process.argv[2] || path.join(process.env.DATA_DIR || ".data", "taskflow.db");
if (!fs.existsSync(file)) { console.error(`SQLite file not found: ${file}`); process.exit(1); }

const sqlite = new DatabaseSync(file, { readOnly: true });
const tableExists = (t) => !!sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
const rows = (t) => (tableExists(t) ? sqlite.prepare(`SELECT * FROM ${t}`).all().map((r) => ({ ...r })) : []);
const iso = (s) => (s ? new Date(s.includes("T") ? s : s.replace(" ", "T") + "Z").toISOString() : null);
const idDoc = ({ id, ...rest }) => ({ _id: id, ...rest });

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);

if ((await db.collection("users").estimatedDocumentCount()) > 0) {
  console.error(`Database "${dbName}" already contains users. Use an empty database (set MONGODB_DB) to migrate into.`);
  process.exit(1);
}

const plan = {
  users: (r) => idDoc({ ...r, created_at: iso(r.created_at) }),
  boards: (r) => idDoc({ ...r, created_at: iso(r.created_at) }),
  sprints: (r) => idDoc({ ...r, completed_at: iso(r.completed_at), created_at: iso(r.created_at) }),
  tickets: (r) => idDoc({ ...r, sprint_id: r.sprint_id ?? null, created_at: iso(r.created_at), updated_at: iso(r.updated_at) }),
  comments: (r) => idDoc({ ...r, created_at: iso(r.created_at) }),
  attachments: (r) => idDoc({ ...r, kind: "file", link_type: null, url: null, drive_id: null, created_at: iso(r.created_at) }),
  activity: (r) => idDoc({ ...r, created_at: iso(r.created_at) }),
  emails: (r) => idDoc({ ...r, created_at: iso(r.created_at) }),
};

for (const [name, map] of Object.entries(plan)) {
  const docs = rows(name).map(map);
  if (docs.length) {
    await db.collection(name).insertMany(docs);
    await db.collection("counters").updateOne({ _id: name }, { $set: { seq: Math.max(...docs.map((d) => d._id)) } }, { upsert: true });
  }
  console.log(`${name.padEnd(12)} ${docs.length}`);
}
await db.collection("meta").updateOne({ _id: "seeded" }, { $set: { at: new Date().toISOString(), from: "sqlite" } }, { upsert: true });

console.log(`\nDone. Start the app; it creates indexes on first connection.`);
await client.close();
