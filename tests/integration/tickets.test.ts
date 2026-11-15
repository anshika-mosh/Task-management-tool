import { beforeEach, describe, expect, it } from "vitest";
import { createTicket, deleteTicket, updateTicket } from "@/lib/actions";
import { col, now } from "@/lib/db";
import { count, expectRedirect, findAll, findOne, loginAs, makeAdmin, makeBoard, makeSprint, makeTicket, makeUser, resetData } from "../helpers";

beforeEach(resetData);

const activityOf = (ticketId: number) => findAll("activity", { ticket_id: ticketId });

describe("createTicket", () => {
  it("creates a ticket with sensible defaults and a BOARD-number key", async () => {
    const me = await makeUser();
    await loginAs(me);
    const board = await makeBoard({ key: "WEB" });
    const res = await createTicket({ boardId: board.id, title: "  Fix the login bug  " });
    expect(res).toEqual({ key: "WEB-1" });
    const t = await findOne("tickets", { board_id: board.id, number: 1 });
    expect(t).toMatchObject({
      title: "Fix the login bug", description: "", type: "task", status: "todo", priority: "medium", progress: 0,
      assignee_id: null, reporter_id: me.id, due_date: null, sprint_id: null,
    });
    expect((await activityOf(t!._id)).map((a) => a.action)).toEqual(["created"]);
  });

  it("numbers tickets per board, independently: WEB-1, WEB-2, MOB-1", async () => {
    await loginAs(await makeUser());
    const web = await makeBoard({ key: "WEB" });
    const mob = await makeBoard({ key: "MOB" });
    expect((await createTicket({ boardId: web.id, title: "a" })).key).toBe("WEB-1");
    expect((await createTicket({ boardId: web.id, title: "b" })).key).toBe("WEB-2");
    expect((await createTicket({ boardId: mob.id, title: "c" })).key).toBe("MOB-1");
    expect((await createTicket({ boardId: web.id, title: "d" })).key).toBe("WEB-3");
  });

  it("never hands out the same number twice, even when created concurrently", async () => {
    await loginAs(await makeUser());
    const board = await makeBoard({ key: "RACE" });
    const results = await Promise.all(Array.from({ length: 25 }, (_, i) => createTicket({ boardId: board.id, title: `t${i}` })));
    const keys = results.map((r) => r.key!);
    expect(new Set(keys).size).toBe(25);
    const numbers = (await findAll("tickets", { board_id: board.id })).map((t) => t.number).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    expect((await findOne("boards", { _id: board.id }))?.counter).toBe(25);
  });

  it("requires sign-in", async () => {
    const board = await makeBoard();
    await expectRedirect(() => createTicket({ boardId: board.id, title: "x" }), "/login");
    expect(await count("tickets")).toBe(0);
  });

  it("requires a summary and a valid board", async () => {
    await loginAs(await makeUser());
    const board = await makeBoard();
    expect(await createTicket({ boardId: board.id, title: "   " })).toEqual({ error: "Summary is required." });
    expect(await createTicket({ boardId: 99999, title: "x" })).toEqual({ error: "Choose a board." });
    expect(await count("tickets")).toBe(0);
  });

  it("caps very long summaries at 250 characters", async () => {
    await loginAs(await makeUser());
    const board = await makeBoard();
    await createTicket({ boardId: board.id, title: "x".repeat(400) });
    expect((await findOne("tickets", {}))?.title).toHaveLength(250);
  });

  it("stores type, priority, assignee, due date and description", async () => {
    const me = await makeUser();
    const assignee = await makeUser();
    await loginAs(me);
    const board = await makeBoard();
    await createTicket({ boardId: board.id, title: "t", description: " details ", type: "bug", priority: "highest", assigneeId: assignee.id, dueDate: "2026-12-31" });
    expect(await findOne("tickets", {})).toMatchObject({ type: "bug", priority: "highest", assignee_id: assignee.id, due_date: "2026-12-31", description: "details" });
  });

  it("ignores invalid type and priority values", async () => {
    await loginAs(await makeUser());
    const board = await makeBoard();
    await createTicket({ boardId: board.id, title: "t", type: "nonsense", priority: "urgent!!" });
    expect(await findOne("tickets", {})).toMatchObject({ type: "task", priority: "medium" });
  });

  it("puts the ticket in a sprint only when it is a non-completed sprint of the same board", async () => {
    await loginAs(await makeUser());
    const board = await makeBoard();
    const other = await makeBoard();
    const ok = await makeSprint(board, { status: "active" });
    const done = await makeSprint(board, { status: "completed" });
    const foreign = await makeSprint(other);
    await createTicket({ boardId: board.id, title: "in sprint", sprintId: ok.id });
    await createTicket({ boardId: board.id, title: "completed sprint", sprintId: done.id });
    await createTicket({ boardId: board.id, title: "foreign sprint", sprintId: foreign.id });
    const by = async (title: string) => (await findOne("tickets", { title }))?.sprint_id;
    expect(await by("in sprint")).toBe(ok.id);
    expect(await by("completed sprint")).toBeNull();
    expect(await by("foreign sprint")).toBeNull();
  });

  it("attaches valid links given at creation time and skips invalid ones", async () => {
    await loginAs(await makeUser());
    const board = await makeBoard();
    await createTicket({
      boardId: board.id, title: "with media",
      links: [
        { url: "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrSt/view", name: "Mockup.png" },
        { url: "javascript:alert(1)", name: "evil" },
        { url: "https://example.com/clip.mp4" },
      ],
    });
    const atts = await findAll("attachments");
    expect(atts.map((a) => [a.filename, a.link_type, a.kind])).toEqual([
      ["Mockup.png", "drive", "link"],
      ["clip.mp4", "video", "link"],
    ]);
    expect(atts[0].drive_id).toBe("1AbCdEfGhIjKlMnOpQrSt");
  });
});

describe("updateTicket", () => {
  async function setup(over: Parameters<typeof makeTicket>[1] = {}) {
    const me = await makeUser({ name: "Me" });
    await loginAs(me);
    const board = await makeBoard({ key: "UP" });
    const t = await makeTicket(board, { title: "Original", ...over });
    return { me, board, t };
  }

  it.each([
    ["status", "in_progress", "todo"],
    ["priority", "highest", "medium"],
    ["type", "bug", "task"],
    ["title", "Renamed", "Original"],
    ["due_date", "2027-01-31", null],
  ] as const)("changes %s and records it in the history", async (field, value, oldValue) => {
    const { t } = await setup();
    await updateTicket(t.id, field, value);
    const doc = await findOne("tickets", { _id: t.id });
    expect(doc![field]).toBe(value);
    const log = (await activityOf(t.id)).find((a) => a.field);
    expect(log).toMatchObject({ action: "changed", new_value: value });
    if (oldValue !== null) expect(log!.old_value).toBe(oldValue);
  });

  it("assigns a ticket and logs the assignee's name (Unassigned when cleared)", async () => {
    const { t } = await setup();
    const alex = await makeUser({ name: "Alex Morgan" });
    await updateTicket(t.id, "assignee_id", alex.id);
    expect((await findOne("tickets", { _id: t.id }))?.assignee_id).toBe(alex.id);
    expect((await activityOf(t.id)).at(-1)).toMatchObject({ field: "Assigned to", old_value: "Unassigned", new_value: "Alex Morgan" });
    await updateTicket(t.id, "assignee_id", null);
    expect((await findOne("tickets", { _id: t.id }))?.assignee_id).toBeNull();
    expect((await activityOf(t.id)).at(-1)).toMatchObject({ old_value: "Alex Morgan", new_value: "Unassigned" });
  });

  it("accepts the assignee id as a string and an empty string as unassigned", async () => {
    const { t } = await setup();
    const u = await makeUser();
    await updateTicket(t.id, "assignee_id", String(u.id));
    expect((await findOne("tickets", { _id: t.id }))?.assignee_id).toBe(u.id);
    await updateTicket(t.id, "assignee_id", "");
    expect((await findOne("tickets", { _id: t.id }))?.assignee_id).toBeNull();
  });

  it("updates the description without storing its text in the history", async () => {
    const { t } = await setup();
    await updateTicket(t.id, "description", "  New long description  ");
    expect((await findOne("tickets", { _id: t.id }))?.description).toBe("New long description");
    expect((await activityOf(t.id)).at(-1)).toMatchObject({ field: "Description", old_value: null, new_value: null });
  });

  it("completing a ticket (status Done) sets progress to 100%", async () => {
    const { t } = await setup({ progress: 40 });
    await updateTicket(t.id, "status", "done");
    expect(await findOne("tickets", { _id: t.id })).toMatchObject({ status: "done", progress: 100 });
  });

  it("moving a ticket out of Done keeps its progress", async () => {
    const { t } = await setup({ status: "done", progress: 100 });
    await updateTicket(t.id, "status", "in_progress");
    expect(await findOne("tickets", { _id: t.id })).toMatchObject({ status: "in_progress", progress: 100 });
  });

  it("ignores invalid status/priority/type values and empty titles", async () => {
    const { t } = await setup();
    await updateTicket(t.id, "status", "bogus");
    await updateTicket(t.id, "priority", "bogus");
    await updateTicket(t.id, "type", "bogus");
    await updateTicket(t.id, "title", "   ");
    expect(await findOne("tickets", { _id: t.id })).toMatchObject({ status: "todo", priority: "medium", type: "task", title: "Original" });
    expect(await activityOf(t.id)).toHaveLength(0);
  });

  it("does nothing (and logs nothing) when the value did not change", async () => {
    const { t } = await setup();
    const before = (await findOne("tickets", { _id: t.id }))!.updated_at;
    await updateTicket(t.id, "status", "todo");
    expect(await activityOf(t.id)).toHaveLength(0);
    expect((await findOne("tickets", { _id: t.id }))!.updated_at).toBe(before);
  });

  it("refreshes updated_at when something changes", async () => {
    const { t } = await setup({ created_at: "2020-01-01T00:00:00.000Z" });
    await updateTicket(t.id, "priority", "low");
    expect((await findOne("tickets", { _id: t.id }))!.updated_at > "2020-01-01T00:00:00.000Z").toBe(true);
  });

  it("changes the sprint only to open sprints of the same board", async () => {
    const { t, board } = await setup();
    const planned = await makeSprint(board, { name: "S planned" });
    const done = await makeSprint(board, { name: "S done", status: "completed" });
    const foreign = await makeSprint(await makeBoard());
    await updateTicket(t.id, "sprint_id", planned.id);
    expect((await findOne("tickets", { _id: t.id }))?.sprint_id).toBe(planned.id);
    expect((await activityOf(t.id)).at(-1)).toMatchObject({ field: "Sprint", old_value: "Backlog", new_value: "S planned" });
    await updateTicket(t.id, "sprint_id", done.id);
    await updateTicket(t.id, "sprint_id", foreign.id);
    expect((await findOne("tickets", { _id: t.id }))?.sprint_id).toBe(planned.id);
    await updateTicket(t.id, "sprint_id", null);
    expect((await findOne("tickets", { _id: t.id }))?.sprint_id).toBeNull();
    expect((await activityOf(t.id)).at(-1)).toMatchObject({ old_value: "S planned", new_value: "Backlog" });
  });

  it("ignores unknown fields and unknown tickets", async () => {
    const { t } = await setup();
    await updateTicket(t.id, "password_hash" as never, "x");
    await updateTicket(99999, "status", "done");
    expect(await activityOf(t.id)).toHaveLength(0);
  });

  it("requires sign-in", async () => {
    const { t } = await setup();
    const { logoutNow } = await import("../helpers");
    logoutNow();
    await expectRedirect(() => updateTicket(t.id, "status", "done"), "/login");
    expect((await findOne("tickets", { _id: t.id }))?.status).toBe("todo");
  });
});

describe("deleteTicket", () => {
  async function ticketWithJunk(reporterId: number | null) {
    const board = await makeBoard({ key: "DEL" });
    const t = await makeTicket(board, { reporter_id: reporterId });
    await (await col("comments")).insertOne({ _id: 1 as never, ticket_id: t.id, user_id: 1, body: "c", kind: "comment", created_at: now() });
    await (await col("activity")).insertOne({ _id: 1 as never, ticket_id: t.id, user_id: 1, action: "created", created_at: now() });
    await (await col("attachments")).insertOne({ _id: 1 as never, ticket_id: t.id, user_id: 1, kind: "link", url: "https://x.test", filename: "l", created_at: now() });
    return t;
  }

  it("lets the reporter delete it, with all related data, and returns to the board", async () => {
    const me = await makeUser();
    await loginAs(me);
    const t = await ticketWithJunk(me.id);
    await expectRedirect(() => deleteTicket(t.id), "/boards/DEL");
    expect(await count("tickets", { _id: t.id })).toBe(0);
    expect(await count("comments", { ticket_id: t.id })).toBe(0);
    expect(await count("activity", { ticket_id: t.id })).toBe(0);
    expect(await count("attachments", { ticket_id: t.id })).toBe(0);
  });

  it("lets an admin delete anyone's ticket", async () => {
    const reporter = await makeUser();
    const t = await ticketWithJunk(reporter.id);
    await loginAs(await makeAdmin());
    await expectRedirect(() => deleteTicket(t.id), "/boards/DEL");
    expect(await count("tickets")).toBe(0);
  });

  it("does not let other members delete it", async () => {
    const reporter = await makeUser();
    const t = await ticketWithJunk(reporter.id);
    await loginAs(await makeUser());
    await deleteTicket(t.id);
    expect(await count("tickets", { _id: t.id })).toBe(1);
    expect(await count("comments", { ticket_id: t.id })).toBe(1);
  });

  it("is a no-op for a ticket that does not exist", async () => {
    await loginAs(await makeUser());
    await expect(deleteTicket(424242)).resolves.toBeUndefined();
  });
});
