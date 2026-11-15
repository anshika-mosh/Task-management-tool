import { MongoClient } from "mongodb";
import { E2E_DB, E2E_URI } from "../../playwright.config";

/** Start every run from an empty database; the app seeds demo data on its first request. */
export default async function globalSetup() {
  if (!E2E_DB.startsWith("taskflow_test_")) throw new Error("E2E database must be a throwaway taskflow_test_* database");
  const c = new MongoClient(E2E_URI, { serverSelectionTimeoutMS: 4000 });
  try {
    await c.connect();
    await c.db(E2E_DB).dropDatabase();
  } catch (e) {
    throw new Error(`Cannot reach MongoDB at ${E2E_URI}: ${(e as Error).message}`);
  } finally {
    await c.close();
  }
}
