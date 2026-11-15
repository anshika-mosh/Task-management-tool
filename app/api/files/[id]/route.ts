import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { getCurrentUser } from "@/lib/auth";
import { get, UPLOAD_DIR } from "@/lib/db";

export const runtime = "nodejs";

const INLINE = /^(image\/(png|jpe?g|gif|webp|avif|bmp)|video\/|audio\/|application\/pdf|text\/plain)/;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const a = get<{ filename: string; stored_name: string; mime: string }>("SELECT filename,stored_name,mime FROM attachments WHERE id = ?", Number(id));
  if (!a) return new Response("Not found", { status: 404 });
  const file = path.join(UPLOAD_DIR, path.basename(a.stored_name));
  let size: number;
  try { size = fs.statSync(file).size; } catch { return new Response("File missing", { status: 404 }); }

  const url = new URL(req.url);
  const inline = INLINE.test(a.mime) && url.searchParams.get("download") !== "1";
  const headers: Record<string, string> = {
    "Content-Type": inline ? a.mime : "application/octet-stream",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(a.filename)}`,
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox",
    "Cache-Control": "private, max-age=3600",
  };

  // HTTP Range support so videos can seek.
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  let start = 0, end = size - 1, status = 200;
  if (range && (range[1] || range[2])) {
    if (range[1]) { start = Number(range[1]); if (range[2]) end = Math.min(Number(range[2]), size - 1); }
    else { start = Math.max(0, size - Number(range[2])); }
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    status = 206;
    headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
  }
  headers["Content-Length"] = String(end - start + 1);
  const stream = Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream;
  return new Response(stream, { status, headers });
}
