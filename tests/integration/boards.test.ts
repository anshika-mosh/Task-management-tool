import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createBoard, deleteBoard, updateBoard } from "@/lib/actions";
import { UPLOAD_DIR, col, now } from "@/lib/db";
import { count, expectRedirect, fd, findOne, loginAs, makeAdmin, makeBoard, makeSprint, makeTicket, makeUser, resetData, revalidated } from "../helpers";

beforeEach(resetData);

describe("createBoard (admin decides board names and keys)", () => {
  it("lets an admin create a board and uppercases the key", async () => {
    await loginAs(await makeAdmin());
    const res = await createBoard(undefined, fd({ name: "Website Team", key: "web", description: "Marketing site", color: "#36b37e" }));
    expect(res).toEqual({ ok: "Board WEB created." });
    const b = await findOne("boards", { key: "WEB" });
    expect(b).toMatchObject({ name: "Website Team", description: "Marketing site", color: "#36b37e", counter: 0 });
    expect(revalidated).toContain("/");
  });

  it("is forbidden for members (redirected home, nothing created)", async () => {
    await loginAs(await makeUser());
    await expectRedirect(() => createBoard(undefined, fd({ name: "X", key: "XX" })), "/");
    expect(await count("boards")).toBe(0);
  });

  it("requires sign-in", async () => {
    await expectRedirect(() => createBoard(undefined, fd({ name: "X", key: "XX" })), "/login");
  });

  it("requires a name", async () => {
    await loginAs(await makeAdmin());
    expect((await createBoard(undefined, fd({ name: "  ", key: "WEB" })))?.error).toMatch(/name is required/i);
  });

  it.each(["1AB", "A", "TOOLONGKEY1", "AB-C", "A B", "", "ÄBC"])("rejects invalid key %j", async (key) => {
    await loginAs(await makeAdmin());
    const res = await createBoard(undefined, fd({ name: "Board", key }));
    expect(res?.error).toMatch(/key must be/i);
    expect(await count("boards")).toBe(0);
  });

  it.each(["AB", "WEB", "A1", "ABCDEFGHI1"])("accepts valid key %s", async (key) => {
    await loginAs(await makeAdmin());
    expect((await createBoard(undefined, fd({ name: "Board", key })))?.ok).toBeTruthy();
  });

  it("refuses a duplicate key, even in a different case", async () => {
    await loginAs(await makeAdmin());
    await createBoard(undefined, fd({ name: "One", key: "WEB" }));
    expect((await createBoard(undefined, fd({ name: "Two", key: "web" })))?.error).toMatch(/already used/i);
    expect(await count("boards")).toBe(1);
  });

  it("falls back to the default colour for invalid colours", async () => {
    await loginAs(await makeAdmin());
    await createBoard(undefined, fd({ name: "One", key: "ONE", color: "red; drop table" }));
    expect((await findOne("boards", { key: "ONE" }))?.color).toBe("#2684ff");
  });
});

describe("updateBoard", () => {
  it("changes name, description and colour but never the key", async () => {
    await loginAs(await makeAdmin());
    const b = await makeBoard({ key: "WEB", name: "Old" });
    const res = await updateBoard(b.id, undefined, fd({ name: "New name", description: "d", color: "#ff5630", key: "HACK" }));
    expect(res).toEqual({ ok: "Saved." });
    expect(await findOne("boards", { _id: b.id })).toMatchObject({ key: "WEB", name: "New name", description: "d", color: "#ff5630" });
  });

  it("requires a name and admin rights", async () => {
    const b = await makeBoard();
    await loginAs(await makeAdmin());
    expect((await updateBoard(b.id, undefined, fd({ name: "" })))?.error).toBeTruthy();
    await loginAs(await makeUser());
    await expectRedirect(() => updateBoard(b.id, undefined, fd({ name: "Hacked" })), "/");
  });
});

describe("deleteBoard", () => {
  it("removes the board with its tickets, comments, history, attachments and sprints, and nothing else", async () => {
    const admin = await makeAdmin();
    await loginAs(admin);
    const doomed = await makeBoard({ key: "DEL" });
    const safe = await makeBoard({ key: "KEEP" });
    const sprint = await makeSprint(doomed);
    const t = await makeTicket(doomed, { sprint_id: sprint.id });
    const keep = await makeTicket(safe);

    const file = path.join(UPLOAD_DIR, "doomed.bin");
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    fs.writeFileSync(file, "x");
    await (await col("comments")).insertOne({ _id: 1 as never, ticket_id: t.id, user_id: admin.id, body: "c", kind: "comment", created_at: now() });
    await (await col("activity")).insertOne({ _id: 1 as never, ticket_id: t.id, user_id: admin.id, action: "created", created_at: now() });
    await (await col("attachments")).insertMany([
      { _id: 1 as never, ticket_id: t.id, user_id: admin.id, kind: "file", stored_name: "doomed.bin", filename: "f", created_at: now() },
      { _id: 2 as never, ticket_id: t.id, user_id: admin.id, kind: "link", url: "https://x.test", filename: "l", created_at: now() },
    ]);
    await (await col("comments")).insertOne({ _id: 2 as never, ticket_id: keep.id, user_id: admin.id, body: "stay", kind: "comment", created_at: now() });

    await deleteBoard(doomed.id);

    expect(await count("boards", { _id: doomed.id })).toBe(0);
    expect(await count("tickets", { board_id: doomed.id })).toBe(0);
    expect(await count("sprints", { board_id: doomed.id })).toBe(0);
    expect(await count("comments", { ticket_id: t.id })).toBe(0);
    expect(await count("activity", { ticket_id: t.id })).toBe(0);
    expect(await count("attachments", { ticket_id: t.id })).toBe(0);
    await new Promise((r) => setTimeout(r, 100)); // file removal is fire-and-forget
    expect(fs.existsSync(file)).toBe(false);
    // the other board is untouched
    expect(await count("boards", { _id: safe.id })).toBe(1);
    expect(await count("tickets", { _id: keep.id })).toBe(1);
    expect(await count("comments", { ticket_id: keep.id })).toBe(1);
  });

  it("is admin-only", async () => {
    const b = await makeBoard();
    await makeTicket(b);
    await loginAs(await makeUser());
    await expectRedirect(() => deleteBoard(b.id), "/");
    expect(await count("boards")).toBe(1);
    expect(await count("tickets")).toBe(1);
  });
});
