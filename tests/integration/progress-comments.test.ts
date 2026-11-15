import { beforeEach, describe, expect, it } from "vitest";
import { addComment, addProgress, deleteComment } from "@/lib/actions";
import { getTickets } from "@/lib/queries";
import { count, expectRedirect, fd, findAll, findOne, loginAs, logoutNow, makeAdmin, makeBoard, makeTicket, makeUser, resetData } from "../helpers";

beforeEach(resetData);

async function setup(over: Parameters<typeof makeTicket>[1] = {}) {
  const me = await makeUser({ name: "Me" });
  await loginAs(me);
  const board = await makeBoard({ key: "PR" });
  const t = await makeTicket(board, over);
  return { me, board, t };
}

describe("addComment", () => {
  it("stores a trimmed comment and bumps the ticket's updated_at", async () => {
    const { me, t } = await setup({ created_at: "2020-01-01T00:00:00.000Z" });
    expect(await addComment(t.id, undefined, fd({ body: "  Looks good  " }))).toEqual({ ok: "Comment added." });
    expect(await findOne("comments", { ticket_id: t.id })).toMatchObject({ body: "Looks good", kind: "comment", user_id: me.id, progress: null, hours: null });
    expect((await findOne("tickets", { _id: t.id }))!.updated_at > "2020-01-01T00:00:00.000Z").toBe(true);
  });

  it("rejects empty comments and unknown tickets", async () => {
    const { t } = await setup();
    expect((await addComment(t.id, undefined, fd({ body: "   " })))?.error).toMatch(/write something/i);
    expect((await addComment(424242, undefined, fd({ body: "hi" })))?.error).toMatch(/not found/i);
    expect(await count("comments")).toBe(0);
  });

  it("requires sign-in", async () => {
    const { t } = await setup();
    logoutNow();
    await expectRedirect(() => addComment(t.id, undefined, fd({ body: "hi" })), "/login");
  });

  it("counts towards the ticket's comment count but not progress updates", async () => {
    const { t } = await setup();
    await addComment(t.id, undefined, fd({ body: "c1" }));
    await addProgress(t.id, undefined, fd({ body: "p1", progress: 10 }));
    expect((await getTickets())[0].comment_count).toBe(1);
  });
});

describe("addProgress (progress updates)", () => {
  it("records the note, percentage and hours, and updates the ticket", async () => {
    const { t } = await setup({ status: "in_progress", progress: 20 });
    expect(await addProgress(t.id, undefined, fd({ body: "Built the table", progress: 60, hours: 2.5 }))).toEqual({ ok: "Progress update posted." });
    expect(await findOne("comments", { ticket_id: t.id })).toMatchObject({ kind: "progress", body: "Built the table", progress: 60, hours: 2.5 });
    expect(await findOne("tickets", { _id: t.id })).toMatchObject({ progress: 60, status: "in_progress" });
    const log = (await findAll("activity", { ticket_id: t.id })).at(-1);
    expect(log).toMatchObject({ field: "Progress", old_value: "20%", new_value: "60%" });
  });

  it("starts the work: a To Do ticket with progress > 0 moves to In Progress (and logs it)", async () => {
    const { t } = await setup({ status: "todo" });
    await addProgress(t.id, undefined, fd({ body: "started", progress: 5 }));
    expect((await findOne("tickets", { _id: t.id }))?.status).toBe("in_progress");
    expect((await findAll("activity", { ticket_id: t.id })).map((a) => a.field)).toEqual(["Progress", "Status"]);
  });

  it("leaves status alone for 0% updates and for tickets already past To Do", async () => {
    const { t, board } = await setup({ status: "todo" });
    await addProgress(t.id, undefined, fd({ body: "planning", progress: 0 }));
    expect((await findOne("tickets", { _id: t.id }))?.status).toBe("todo");
    const review = await makeTicket(board, { status: "in_review" });
    await addProgress(review.id, undefined, fd({ body: "tweaks", progress: 90 }));
    expect((await findOne("tickets", { _id: review.id }))?.status).toBe("in_review");
  });

  it.each([
    [150, 100],
    [-20, 0],
    [49.6, 50],
  ])("clamps/rounds progress %s to %s", async (input, expected) => {
    const { t } = await setup();
    await addProgress(t.id, undefined, fd({ body: "x", progress: input }));
    expect((await findOne("tickets", { _id: t.id }))?.progress).toBe(expected);
  });

  it("allows a note with no percentage: ticket progress is untouched", async () => {
    const { t } = await setup({ progress: 33, status: "in_progress" });
    await addProgress(t.id, undefined, fd({ body: "just a note", progress: "", hours: "" }));
    expect(await findOne("tickets", { _id: t.id })).toMatchObject({ progress: 33 });
    expect(await findOne("comments", { ticket_id: t.id })).toMatchObject({ progress: null, hours: null });
  });

  it("requires a note and numeric values", async () => {
    const { t } = await setup();
    expect((await addProgress(t.id, undefined, fd({ body: "", progress: 10 })))?.error).toMatch(/describe/i);
    expect((await addProgress(t.id, undefined, fd({ body: "x", progress: "abc" })))?.error).toMatch(/numbers/i);
    expect((await addProgress(t.id, undefined, fd({ body: "x", hours: "abc" })))?.error).toMatch(/numbers/i);
    expect((await addProgress(424242, undefined, fd({ body: "x" })))?.error).toMatch(/not found/i);
    expect(await count("comments")).toBe(0);
  });

  it("never records negative hours", async () => {
    const { t } = await setup();
    await addProgress(t.id, undefined, fd({ body: "x", hours: -4 }));
    expect((await findOne("comments", { ticket_id: t.id }))?.hours).toBe(0);
  });

  it("accumulates logged hours on the ticket", async () => {
    const { t } = await setup();
    await addProgress(t.id, undefined, fd({ body: "a", progress: 10, hours: 1.5 }));
    await addProgress(t.id, undefined, fd({ body: "b", progress: 20, hours: 2 }));
    expect((await getTickets())[0].hours).toBe(3.5);
  });
});

describe("deleteComment", () => {
  async function comment() {
    const author = await makeUser();
    const board = await makeBoard();
    const t = await makeTicket(board);
    await loginAs(author);
    await addComment(t.id, undefined, fd({ body: "mine" }));
    return { author, t, id: (await findOne("comments", { ticket_id: t.id }))!._id as number };
  }

  it("lets the author delete their comment", async () => {
    const { id } = await comment();
    await deleteComment(id);
    expect(await count("comments")).toBe(0);
  });
  it("lets an admin delete anyone's comment", async () => {
    const { id } = await comment();
    await loginAs(await makeAdmin());
    await deleteComment(id);
    expect(await count("comments")).toBe(0);
  });
  it("does not let other members delete it", async () => {
    const { id } = await comment();
    await loginAs(await makeUser());
    await deleteComment(id);
    expect(await count("comments")).toBe(1);
  });
});
