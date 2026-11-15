import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { get, run, UPLOAD_DIR } from "@/lib/db";
import { MAX_UPLOAD_MB } from "@/lib/constants";
import { notifyActivity } from "@/lib/mail";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  const ticketId = Number(id);
  if (!get("SELECT id FROM tickets WHERE id = ?", ticketId)) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return NextResponse.json({ error: "No files" }, { status: 400 });

  const saved: { id: number; filename: string }[] = [];
  for (const f of files) {
    if (f.size > MAX_UPLOAD_MB * 1024 * 1024) return NextResponse.json({ error: `${f.name} exceeds ${MAX_UPLOAD_MB} MB` }, { status: 413 });
    const ext = path.extname(f.name).slice(0, 12).replace(/[^.\w]/g, "");
    const stored = crypto.randomUUID() + ext;
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.writeFile(path.join(UPLOAD_DIR, stored), Buffer.from(await f.arrayBuffer()));
    const r = run(
      "INSERT INTO attachments (ticket_id,user_id,filename,stored_name,mime,size) VALUES (?,?,?,?,?,?)",
      ticketId, me.id, f.name.slice(0, 200), stored, f.type || "application/octet-stream", f.size,
    );
    run("INSERT INTO activity (ticket_id,user_id,action,field,new_value) VALUES (?,?,'added','Attachment',?)", ticketId, me.id, f.name.slice(0, 200));
    saved.push({ id: Number(r.lastInsertRowid), filename: f.name });
  }
  run("UPDATE tickets SET updated_at = datetime('now') WHERE id = ?", ticketId);
  notifyActivity(ticketId, me.id, `attached ${saved.length === 1 ? saved[0].filename : saved.length + " files"}`);
  revalidatePath("/", "layout");
  return NextResponse.json({ saved });
}
