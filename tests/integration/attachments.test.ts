import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { addLinkAttachment, deleteAttachment, deleteTicket } from "@/lib/actions";
import { UPLOAD_DIR, col, now } from "@/lib/db";
import { getAttachments, getTickets } from "@/lib/queries";
import { count, expectRedirect, fd, findAll, findOne, loginAs, logoutNow, makeAdmin, makeBoard, makeTicket, makeUser, resetData } from "../helpers";

beforeEach(resetData);

const DRIVE = "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz12345/view?usp=sharing";

async function setup() {
  const me = await makeUser({ name: "Me" });
  await loginAs(me);
  const board = await makeBoard({ key: "AT" });
  const t = await makeTicket(board, { created_at: "2020-01-01T00:00:00.000Z" });
  return { me, board, t };
}

describe("addLinkAttachment (images & videos as Google Drive links)", () => {
  it("attaches a Drive link, extracting the file id", async () => {
    const { me, t } = await setup();
    expect(await addLinkAttachment(t.id, undefined, fd({ url: DRIVE, name: "Pricing mockup.png" }))).toEqual({ ok: "Link attached." });
    expect(await findOne("attachments", { ticket_id: t.id })).toMatchObject({
      kind: "link", link_type: "drive", drive_id: "1AbCdEfGhIjKlMnOpQrStUvWxYz12345", url: DRIVE, filename: "Pricing mockup.png", user_id: me.id,
    });
  });

  it("uses a default name when none is given", async () => {
    const { t } = await setup();
    await addLinkAttachment(t.id, undefined, fd({ url: DRIVE }));
    await addLinkAttachment(t.id, undefined, fd({ url: "https://cdn.test/a/b/photo.jpg" }));
    expect((await findAll("attachments")).map((a) => a.filename)).toEqual(["Drive file", "photo.jpg"]);
  });

  it("supports direct image/video and ordinary web links", async () => {
    const { t } = await setup();
    await addLinkAttachment(t.id, undefined, fd({ url: "https://cdn.test/clip.mp4" }));
    await addLinkAttachment(t.id, undefined, fd({ url: "https://www.loom.com/share/abc" }));
    expect((await findAll("attachments")).map((a) => a.link_type)).toEqual(["video", "web"]);
  });

  it.each(["", "   ", "not a url", "javascript:alert(1)", "data:text/html,hi", "ftp://x.test/f"])("rejects %j", async (url) => {
    const { t } = await setup();
    expect((await addLinkAttachment(t.id, undefined, fd({ url })))?.error).toMatch(/https:\/\//);
    expect(await count("attachments")).toBe(0);
  });

  it("rejects links for unknown tickets", async () => {
    await setup();
    expect((await addLinkAttachment(424242, undefined, fd({ url: DRIVE })))?.error).toMatch(/not found/i);
  });

  it("records history, bumps the ticket and shows up in counts and the attachment list", async () => {
    const { t } = await setup();
    await addLinkAttachment(t.id, undefined, fd({ url: DRIVE, name: "Mock.png" }));
    expect((await findAll("activity", { ticket_id: t.id })).at(-1)).toMatchObject({ action: "added", field: "Attachment", new_value: "Mock.png" });
    expect((await findOne("tickets", { _id: t.id }))!.updated_at > "2020-01-01T00:00:00.000Z").toBe(true);
    expect((await getTickets())[0].attach_count).toBe(1);
    const list = await getAttachments(t.id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ kind: "link", link_type: "drive", drive_id: "1AbCdEfGhIjKlMnOpQrStUvWxYz12345", filename: "Mock.png", user_name: "Me", size: 0 });
  });

  it("requires sign-in", async () => {
    const { t } = await setup();
    logoutNow();
    await expectRedirect(() => addLinkAttachment(t.id, undefined, fd({ url: DRIVE })), "/login");
  });
});

describe("getAttachments", () => {
  it("lists newest first and tolerates legacy documents without link fields", async () => {
    const { me, t } = await setup();
    await (await col("attachments")).insertMany([
      { _id: 1 as never, ticket_id: t.id, user_id: me.id, filename: "old.png", mime: "image/png", size: 10, stored_name: "x", created_at: now() },
      { _id: 2 as never, ticket_id: t.id, user_id: me.id, kind: "link", link_type: "web", url: "https://x.test", filename: "new", created_at: now() },
    ]);
    const list = await getAttachments(t.id);
    expect(list.map((a) => a.filename)).toEqual(["new", "old.png"]);
    expect(list[1]).toMatchObject({ kind: "file", link_type: null, url: null, drive_id: null, mime: "image/png", size: 10 });
  });
});

describe("deleteAttachment", () => {
  async function withLink() {
    const author = await makeUser();
    const board = await makeBoard();
    const t = await makeTicket(board);
    await loginAs(author);
    await addLinkAttachment(t.id, undefined, fd({ url: DRIVE, name: "A.png" }));
    return { author, t, id: (await findOne("attachments", { ticket_id: t.id }))!._id as number };
  }

  it("lets the uploader remove it, and logs the removal", async () => {
    const { t, id } = await withLink();
    await deleteAttachment(id);
    expect(await count("attachments")).toBe(0);
    expect((await findAll("activity", { ticket_id: t.id })).at(-1)).toMatchObject({ action: "removed", field: "Attachment", old_value: "A.png" });
  });

  it("lets admins remove anyone's attachment", async () => {
    const { id } = await withLink();
    await loginAs(await makeAdmin());
    await deleteAttachment(id);
    expect(await count("attachments")).toBe(0);
  });

  it("does not let other members remove it", async () => {
    const { id } = await withLink();
    await loginAs(await makeUser());
    await deleteAttachment(id);
    expect(await count("attachments")).toBe(1);
  });

  it("also deletes the stored file for local uploads (never touches anything for links)", async () => {
    const me = await makeUser();
    await loginAs(me);
    const t = await makeTicket(await makeBoard());
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const f = path.join(UPLOAD_DIR, "stored.bin");
    fs.writeFileSync(f, "data");
    await (await col("attachments")).insertOne({ _id: 7 as never, ticket_id: t.id, user_id: me.id, kind: "file", stored_name: "stored.bin", filename: "x.bin", mime: "x/y", size: 4, created_at: now() });
    await deleteAttachment(7);
    await new Promise((r) => setTimeout(r, 100));
    expect(fs.existsSync(f)).toBe(false);
  });

  it("deleting a ticket removes the stored files of its local uploads", async () => {
    const me = await makeUser();
    await loginAs(me);
    const t = await makeTicket(await makeBoard({ key: "FX" }), { reporter_id: me.id });
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const f = path.join(UPLOAD_DIR, "orphan.bin");
    fs.writeFileSync(f, "data");
    await (await col("attachments")).insertOne({ _id: 8 as never, ticket_id: t.id, user_id: me.id, kind: "file", stored_name: "orphan.bin", filename: "o.bin", mime: "x/y", size: 4, created_at: now() });
    await expectRedirect(() => deleteTicket(t.id), "/boards/FX");
    await new Promise((r) => setTimeout(r, 100));
    expect(fs.existsSync(f)).toBe(false);
  });
});
