import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DATA_DIR, col, toRow } from "./db";
import type { User } from "./types";

const COOKIE = "tf_session";
const TTL_MS = 7 * 24 * 3600 * 1000;

function secret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const file = path.join(DATA_DIR, "secret");
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    const s = crypto.randomBytes(32).toString("hex");
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(file, s);
    return s;
  }
}

const sign = (payload: string) => crypto.createHmac("sha256", secret()).update(payload).digest("base64url");

export async function createSession(userId: number) {
  const payload = `${userId}.${Date.now() + TTL_MS}`;
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: TTL_MS / 1000,
    secure: process.env.COOKIE_SECURE === "true",
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [id, exp, sig] = raw.split(".");
  const expected = sign(`${id}.${exp}`);
  const a = Buffer.from(sig ?? "");
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (Number(exp) < Date.now()) return null;
  const doc = await (await col("users")).findOne({ _id: Number(id) as never }, { projection: { password_hash: 0 } });
  return toRow<User>(doc) ?? null;
});

export async function requireUser(): Promise<User> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireAdmin(): Promise<User> {
  const u = await requireUser();
  if (u.role !== "admin") redirect("/");
  return u;
}
