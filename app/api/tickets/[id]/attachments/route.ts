import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { col, nextId, now, UPLOAD_DIR, uploadsEnabled } from "@/lib/db";
import { MAX_UPLOAD_MB } from "@/lib/constants";
import { notifyActivity } from "@/lib/mail";

export const runtime = "nodejs";

// Optional local-disk uploads (ALLOW_FILE_UPLOADS=true). Images/videos normally go through Drive links instead.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!uploadsEnabled()) return NextResponse.json({ error: "File uploads are disabled. Attach a Google Drive link instead." }, { status: 403 });
  const { id } = await ctx.params;
  const ticketId = Number(id);
  if (!(await (await col("tickets")).findOne({ _id: ticketId as never }, { projection: { _id: 1 } }))) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return NextResponse.json({ error: "No files" }, { status: 400 });

  const attachments = await col("attachments");
  const activity = await col("activity");
  const saved: { id: number; filename: string }[] = [];
  for (const f of files) {
    if (f.size > MAX_UPLOAD_MB * 1024 * 1024) return NextResponse.json({ error: `${f.name} exceeds ${MAX_UPLOAD_MB} MB` }, { status: 413 });
    const ext = path.extname(f.name).slice(0, 12).replace(/[^.\w]/g, "");
    const stored = crypto.randomUUID() + ext;
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.writeFile(path.join(UPLOAD_DIR, stored), Buffer.from(await f.arrayBuffer()));
    const aid = await nextId("attachments");
    const filename = f.name.slice(0, 200);
    await attachments.insertOne({
      _id: aid as never, ticket_id: ticketId, user_id: me.id, kind: "file", link_type: null, url: null, drive_id: null,
      filename, stored_name: stored, mime: f.type || "application/octet-stream", size: f.size, created_at: now(),
    });
    await activity.insertOne({ _id: (await nextId("activity")) as never, ticket_id: ticketId, user_id: me.id, action: "added", field: "Attachment", old_value: null, new_value: filename, created_at: now() });
    saved.push({ id: aid, filename: f.name });
  }
  await (await col("tickets")).updateOne({ _id: ticketId as never }, { $set: { updated_at: now() } });
  notifyActivity(ticketId, me.id, `attached ${saved.length === 1 ? saved[0].filename : saved.length + " files"}`);
  revalidatePath("/", "layout");
  return NextResponse.json({ saved });
}
