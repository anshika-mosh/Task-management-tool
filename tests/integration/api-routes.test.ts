import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { GET as getFile } from "@/app/api/files/[id]/route";
import { POST as upload } from "@/app/api/tickets/[id]/attachments/route";
import { GET as ticketId } from "@/app/api/ticket-id/route";
import { UPLOAD_DIR, col, now } from "@/lib/db";
import { emails, flushAfter, findAll, findOne, loginAs, logoutNow, makeBoard, makeTicket, makeUser, resetData } from "../helpers";

beforeEach(resetData);

const ctx = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });
const req = (url: string, init?: RequestInit) => new Request(`http://localhost${url}`, init);

describe("GET /api/ticket-id", () => {
  it("resolves a ticket key to its id for signed-in users (case-insensitive)", async () => {
    await loginAs(await makeUser());
    const t = await makeTicket(await makeBoard({ key: "WEB" }));
    for (const key of ["WEB-1", "web-1"]) {
      const res = await ticketId(req(`/api/ticket-id?key=${key}`));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ id: t.id });
    }
  });
  it("404s for unknown or malformed keys", async () => {
    await loginAs(await makeUser());
    for (const key of ["NOPE-1", "WEB", "", "WEB-99"]) expect((await ticketId(req(`/api/ticket-id?key=${key}`))).status).toBe(404);
  });
  it("requires sign-in", async () => {
    expect((await ticketId(req("/api/ticket-id?key=WEB-1"))).status).toBe(401);
  });
});

/* -------------------------------- file serving ------------------------------- */

async function storeFile(content: string | Buffer, mime: string, filename = "photo.png") {
  const me = await makeUser();
  await loginAs(me);
  const t = await makeTicket(await makeBoard());
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const stored = `${Math.random().toString(36).slice(2)}.bin`;
  fs.writeFileSync(path.join(UPLOAD_DIR, stored), content);
  const id = ((await (await col("attachments")).countDocuments()) + 1) as number;
  await (await col("attachments")).insertOne({ _id: id as never, ticket_id: t.id, user_id: me.id, kind: "file", filename, stored_name: stored, mime, size: Buffer.byteLength(content), created_at: now() });
  return { id, stored };
}

describe("GET /api/files/[id]", () => {
  it("serves images inline with safe headers", async () => {
    const { id } = await storeFile("PNGDATA", "image/png", "my photo.png");
    const res = await getFile(req(`/api/files/${id}`), ctx(id));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("PNGDATA");
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("content-disposition")).toBe("inline; filename*=UTF-8''my%20photo.png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toBe("sandbox");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("content-length")).toBe("7");
  });

  it("forces download of types that could run scripts in the browser (HTML, SVG, unknown)", async () => {
    for (const mime of ["text/html", "image/svg+xml", "application/x-msdownload"]) {
      const { id } = await storeFile("<script>alert(1)</script>", mime, "evil.html");
      const res = await getFile(req(`/api/files/${id}`), ctx(id));
      expect(res.headers.get("content-type")).toBe("application/octet-stream");
      expect(res.headers.get("content-disposition")).toMatch(/^attachment;/);
    }
  });

  it("?download=1 turns an inline file into a download", async () => {
    const { id } = await storeFile("x", "image/png");
    const res = await getFile(req(`/api/files/${id}?download=1`), ctx(id));
    expect(res.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
  });

  it("supports HTTP range requests so videos can seek", async () => {
    const { id } = await storeFile("0123456789", "video/mp4", "clip.mp4");
    const res = await getFile(req(`/api/files/${id}`, { headers: { range: "bytes=2-5" } }), ctx(id));
    expect(res.status).toBe(206);
    expect(await res.text()).toBe("2345");
    expect(res.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(res.headers.get("content-length")).toBe("4");
  });

  it("supports open-ended and suffix ranges, clamping to the file size", async () => {
    const { id } = await storeFile("0123456789", "video/mp4");
    const open = await getFile(req(`/api/files/${id}`, { headers: { range: "bytes=7-" } }), ctx(id));
    expect([open.status, await open.text(), open.headers.get("content-range")]).toEqual([206, "789", "bytes 7-9/10"]);
    const suffix = await getFile(req(`/api/files/${id}`, { headers: { range: "bytes=-4" } }), ctx(id));
    expect([suffix.status, await suffix.text()]).toEqual([206, "6789"]);
    const clamp = await getFile(req(`/api/files/${id}`, { headers: { range: "bytes=5-999" } }), ctx(id));
    expect([clamp.status, await clamp.text(), clamp.headers.get("content-range")]).toEqual([206, "56789", "bytes 5-9/10"]);
  });

  it("answers 416 for ranges outside the file", async () => {
    const { id } = await storeFile("0123456789", "video/mp4");
    const res = await getFile(req(`/api/files/${id}`, { headers: { range: "bytes=50-60" } }), ctx(id));
    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe("bytes */10");
  });

  it("requires sign-in", async () => {
    const { id } = await storeFile("x", "image/png");
    logoutNow();
    expect((await getFile(req(`/api/files/${id}`), ctx(id))).status).toBe(401);
  });

  it("404s for unknown attachments, link attachments, and files missing from disk", async () => {
    const { id, stored } = await storeFile("x", "image/png");
    expect((await getFile(req("/api/files/9999"), ctx(9999))).status).toBe(404);
    expect((await getFile(req("/api/files/abc"), ctx("abc"))).status).toBe(404);
    const link = id + 1;
    await (await col("attachments")).insertOne({ _id: link as never, ticket_id: 1, user_id: 1, kind: "link", url: "https://x.test", filename: "l", created_at: now() });
    expect((await getFile(req(`/api/files/${link}`), ctx(link))).status).toBe(404);
    fs.rmSync(path.join(UPLOAD_DIR, stored));
    const res = await getFile(req(`/api/files/${id}`), ctx(id));
    expect(res.status).toBe(404);
  });

  it("cannot be tricked into reading files outside the upload folder", async () => {
    const me = await makeUser();
    await loginAs(me);
    const outside = path.join(path.dirname(UPLOAD_DIR), "secret.txt");
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    fs.writeFileSync(outside, "TOP SECRET");
    await (await col("attachments")).insertOne({ _id: 1 as never, ticket_id: 1, user_id: me.id, kind: "file", filename: "x", stored_name: "../secret.txt", mime: "text/plain", size: 1, created_at: now() });
    const res = await getFile(req("/api/files/1"), ctx(1));
    expect(res.status).toBe(404); // basename() confines the lookup to UPLOAD_DIR
  });
});

/* ---------------------------------- uploads ---------------------------------- */

const form = (...files: File[]) => {
  const f = new FormData();
  for (const file of files) f.append("files", file);
  return f;
};
const file = (name: string, content = "hello", type = "text/plain") => new File([content], name, { type });
const post = (t: { id: number }, body: FormData) => upload(req(`/api/tickets/${t.id}/attachments`, { method: "POST", body }), ctx(t.id));

describe("POST /api/tickets/[id]/attachments (optional local uploads)", () => {
  async function setup() {
    const rita = await makeUser({ name: "Rita", email: "rita@test.dev" });
    const alan = await makeUser({ name: "Alan", email: "alan@test.dev" });
    await loginAs(rita);
    const t = await makeTicket(await makeBoard({ key: "UP" }), { reporter_id: rita.id, assignee_id: alan.id });
    return { rita, alan, t };
  }

  it("is disabled by default and tells users to use a Drive link", async () => {
    const { t } = await setup();
    delete process.env.ALLOW_FILE_UPLOADS;
    const res = await post(t, form(file("a.txt")));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/Drive link/);
    expect(await findAll("attachments")).toHaveLength(0);
  });

  describe("when ALLOW_FILE_UPLOADS=true", () => {
    beforeEach(() => void (process.env.ALLOW_FILE_UPLOADS = "true"));

    it("stores the file on disk and records it with history, and emails the assignee", async () => {
      const { rita, t } = await setup();
      const res = await post(t, form(file("notes.txt", "hello world")));
      expect(res.status).toBe(200);
      const { saved } = await res.json();
      expect(saved).toHaveLength(1);
      const att = await findOne("attachments", { ticket_id: t.id });
      expect(att).toMatchObject({ kind: "file", filename: "notes.txt", mime: "text/plain", size: 11, user_id: rita.id, link_type: null, url: null });
      expect(fs.readFileSync(path.join(UPLOAD_DIR, att!.stored_name), "utf8")).toBe("hello world");
      expect((await findAll("activity", { ticket_id: t.id })).at(-1)).toMatchObject({ action: "added", field: "Attachment", new_value: "notes.txt" });
      await flushAfter();
      expect((await emails())[0]).toMatchObject({ to_email: "alan@test.dev", subject: "[UP-1] Rita attached notes.txt" });
    });

    it("handles several files at once (one summary email)", async () => {
      const { t } = await setup();
      const res = await post(t, form(file("a.txt"), file("b.txt"), file("c.txt")));
      expect((await res.json()).saved).toHaveLength(3);
      expect(await findAll("attachments")).toHaveLength(3);
      await flushAfter();
      expect((await emails()).map((e) => e.subject)).toEqual(["[UP-1] Rita attached 3 files"]);
    });

    it("never trusts the client's file name for the stored path", async () => {
      const { t } = await setup();
      await post(t, form(file("../../evil.txt")));
      const att = (await findOne("attachments", {}))!;
      expect(att.stored_name).toMatch(/^[0-9a-f-]{36}(\.txt)?$/);
      expect(fs.existsSync(path.join(UPLOAD_DIR, att.stored_name))).toBe(true);
    });

    it("rejects requests without files, for unknown tickets, and when signed out", async () => {
      const { t } = await setup();
      expect((await post(t, new FormData())).status).toBe(400);
      expect((await post({ id: 4242 }, form(file("a.txt")))).status).toBe(404);
      logoutNow();
      expect((await post(t, form(file("a.txt")))).status).toBe(401);
    });

    it("an uploaded file can be downloaded again through the files route", async () => {
      const { t } = await setup();
      await post(t, form(file("pic.png", "PNGBYTES", "image/png")));
      const id = (await findOne("attachments", {}))!._id as number;
      const res = await getFile(req(`/api/files/${id}`), ctx(id));
      expect(await res.text()).toBe("PNGBYTES");
    });
  });
});
