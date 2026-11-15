import { MongoClient } from "mongodb";

/**
 * Tests run against a real MongoDB but ONLY in throwaway databases named `taskflow_test_*`
 * (created per test file, dropped afterwards). They never read .env.local, so they can't
 * touch your real data. Point them elsewhere with TEST_MONGODB_URI.
 */
export const TEST_URI = () => process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27017";

export async function setup() {
  const uri = TEST_URI();
  if (/mongodb\+srv|\.mongodb\.net/.test(uri) && process.env.ALLOW_REMOTE_TEST_DB !== "true") {
    throw new Error("Refusing to run tests against a hosted MongoDB. Use a local MongoDB (default) or set ALLOW_REMOTE_TEST_DB=true if you really mean it.");
  }
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 4000 });
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
  } catch (e) {
    throw new Error(`Cannot reach MongoDB at ${uri} (${(e as Error).message}).\nStart a local MongoDB, or set TEST_MONGODB_URI. Tests only use throwaway "taskflow_test_*" databases.`);
  } finally {
    await client.close();
  }
}

export async function teardown() {
  // Remove any leftovers from crashed runs.
  const client = new MongoClient(TEST_URI());
  try {
    await client.connect();
    const { databases } = await client.db().admin().listDatabases();
    for (const d of databases) if (d.name.startsWith("taskflow_test_")) await client.db(d.name).dropDatabase();
  } finally {
    await client.close();
  }
}
