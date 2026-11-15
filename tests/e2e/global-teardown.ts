import { MongoClient } from "mongodb";
import { E2E_DB, E2E_URI } from "../../playwright.config";

export default async function globalTeardown() {
  const c = new MongoClient(E2E_URI);
  try {
    await c.connect();
    await c.db(E2E_DB).dropDatabase();
  } finally {
    await c.close();
  }
}
