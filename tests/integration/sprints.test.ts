import { beforeEach, describe, expect, it } from "vitest";
import { completeSprint, createSprint, deleteSprint, startSprint } from "@/lib/actions";
import { today } from "@/lib/db";
import { count, expectRedirect, fd, findAll, findOne, loginAs, logoutNow, makeBoard, makeSprint, makeTicket, makeUser, resetData } from "../helpers";

beforeEach(resetData);

async function setup() {
  const me = await makeUser({ name: "Scrum Master" });
  await loginAs(me);
  const board = await makeBoard({ key: "SP" });
  return { me, board };
}

describe("createSprint", () => {
  it("creates a planned sprint for a board (any signed-in user)", async () => {
    const { board } = await setup();
    const res = await createSprint(board.id, undefined, fd({ name: "  Sprint 1  ", goal: "Ship it", start: "2026-02-01", end: "2026-02-14" }));
    expect(res).toEqual({ ok: 'Sprint "Sprint 1" created.' });
    expect(await findOne("sprints", { board_id: board.id })).toMatchObject({
      name: "Sprint 1", goal: "Ship it", start_date: "2026-02-01", end_date: "2026-02-14", status: "planned", completed_at: null,
    });
  });

  it("dates are optional", async () => {
    const { board } = await setup();
    await createSprint(board.id, undefined, fd({ name: "S" }));
    expect(await findOne("sprints", {})).toMatchObject({ start_date: null, end_date: null });
  });

  it("validates name, date order and board", async () => {
    const { board } = await setup();
    expect((await createSprint(board.id, undefined, fd({ name: "  " })))?.error).toMatch(/name is required/i);
    expect((await createSprint(board.id, undefined, fd({ name: "S", start: "2026-02-10", end: "2026-02-01" })))?.error).toMatch(/end date/i);
    expect((await createSprint(99999, undefined, fd({ name: "S" })))?.error).toMatch(/board not found/i);
    expect(await count("sprints")).toBe(0);
  });

  it("requires sign-in", async () => {
    const { board } = await setup();
    logoutNow();
    await expectRedirect(() => createSprint(board.id, undefined, fd({ name: "S" })), "/login");
  });
});

describe("startSprint", () => {
  it("activates a planned sprint and fills in today's date when no start date was set", async () => {
    const { board } = await setup();
    const s = await makeSprint(board, { start_date: null });
    expect(await startSprint(s.id)).toEqual({});
    expect(await findOne("sprints", { _id: s.id })).toMatchObject({ status: "active", start_date: today() });
  });

  it("keeps an explicit start date", async () => {
    const { board } = await setup();
    const s = await makeSprint(board, { start_date: "2026-05-01" });
    await startSprint(s.id);
    expect((await findOne("sprints", { _id: s.id }))?.start_date).toBe("2026-05-01");
  });

  it("allows only one active sprint per board", async () => {
    const { board } = await setup();
    const first = await makeSprint(board, { name: "First" });
    const second = await makeSprint(board, { name: "Second" });
    await startSprint(first.id);
    expect((await startSprint(second.id)).error).toMatch(/"First" is already active/);
    expect((await findOne("sprints", { _id: second.id }))?.status).toBe("planned");
  });

  it("different boards can each have an active sprint", async () => {
    const { board } = await setup();
    const other = await makeBoard();
    await startSprint((await makeSprint(board)).id);
    expect((await startSprint((await makeSprint(other)).id)).error).toBeUndefined();
    expect(await count("sprints", { status: "active" })).toBe(2);
  });

  it("only planned sprints can be started", async () => {
    const { board } = await setup();
    const active = await makeSprint(board, { status: "active" });
    const done = await makeSprint(board, { status: "completed" });
    expect((await startSprint(active.id)).error).toMatch(/only a planned/i);
    expect((await startSprint(done.id)).error).toMatch(/only a planned/i);
    expect((await startSprint(99999)).error).toMatch(/only a planned/i);
  });
});

describe("completeSprint", () => {
  async function activeWithTickets() {
    const { me, board } = await setup();
    const sprint = await makeSprint(board, { name: "Sprint 1", status: "active" });
    const done = await makeTicket(board, { status: "done", sprint_id: sprint.id });
    const todo = await makeTicket(board, { status: "todo", sprint_id: sprint.id });
    const review = await makeTicket(board, { status: "in_review", sprint_id: sprint.id });
    return { me, board, sprint, done, todo, review };
  }

  it("moves unfinished tickets back to the backlog and keeps finished ones in the sprint", async () => {
    const { sprint, done, todo, review } = await activeWithTickets();
    expect(await completeSprint(sprint.id, null)).toEqual({});
    expect(await findOne("sprints", { _id: sprint.id })).toMatchObject({ status: "completed" });
    expect((await findOne("sprints", { _id: sprint.id }))!.completed_at).toBeTruthy();
    expect((await findOne("tickets", { _id: done.id }))?.sprint_id).toBe(sprint.id);
    expect((await findOne("tickets", { _id: todo.id }))?.sprint_id).toBeNull();
    expect((await findOne("tickets", { _id: review.id }))?.sprint_id).toBeNull();
  });

  it("can roll unfinished tickets into the next planned sprint", async () => {
    const { board, sprint, todo, review, done } = await activeWithTickets();
    const next = await makeSprint(board, { name: "Sprint 2" });
    await completeSprint(sprint.id, next.id);
    expect((await findOne("tickets", { _id: todo.id }))?.sprint_id).toBe(next.id);
    expect((await findOne("tickets", { _id: review.id }))?.sprint_id).toBe(next.id);
    expect((await findOne("tickets", { _id: done.id }))?.sprint_id).toBe(sprint.id);
  });

  it("logs the move on each moved ticket", async () => {
    const { board, sprint, todo } = await activeWithTickets();
    const next = await makeSprint(board, { name: "Sprint 2" });
    await completeSprint(sprint.id, next.id);
    expect((await findAll("activity", { ticket_id: todo.id })).at(-1)).toMatchObject({ field: "Sprint", old_value: "Sprint 1", new_value: "Sprint 2" });
  });

  it("falls back to the backlog when the target is invalid (other board, not planned)", async () => {
    const { sprint, todo } = await activeWithTickets();
    const foreign = await makeSprint(await makeBoard());
    await completeSprint(sprint.id, foreign.id);
    expect((await findOne("tickets", { _id: todo.id }))?.sprint_id).toBeNull();
  });

  it("works when every ticket is already done", async () => {
    const { board } = await setup();
    const sprint = await makeSprint(board, { status: "active" });
    const t = await makeTicket(board, { status: "done", sprint_id: sprint.id });
    expect(await completeSprint(sprint.id, null)).toEqual({});
    expect((await findOne("tickets", { _id: t.id }))?.sprint_id).toBe(sprint.id);
  });

  it("only an active sprint can be completed (and not twice)", async () => {
    const { board } = await setup();
    const planned = await makeSprint(board);
    expect((await completeSprint(planned.id, null)).error).toMatch(/only an active/i);
    const active = await makeSprint(board, { status: "active" });
    await completeSprint(active.id, null);
    expect((await completeSprint(active.id, null)).error).toMatch(/only an active/i);
  });

  it("frees the board so another sprint can be started", async () => {
    const { board } = await setup();
    const a = await makeSprint(board, { status: "active" });
    const b = await makeSprint(board);
    await completeSprint(a.id, null);
    expect((await startSprint(b.id)).error).toBeUndefined();
  });
});

describe("deleteSprint", () => {
  it("deletes a planned sprint and sends its tickets back to the backlog", async () => {
    const { board } = await setup();
    const s = await makeSprint(board);
    const t = await makeTicket(board, { sprint_id: s.id });
    expect(await deleteSprint(s.id)).toEqual({});
    expect(await count("sprints")).toBe(0);
    expect((await findOne("tickets", { _id: t.id }))?.sprint_id).toBeNull();
  });

  it("can delete a completed sprint", async () => {
    const { board } = await setup();
    const s = await makeSprint(board, { status: "completed" });
    await deleteSprint(s.id);
    expect(await count("sprints")).toBe(0);
  });

  it("refuses to delete the active sprint", async () => {
    const { board } = await setup();
    const s = await makeSprint(board, { status: "active" });
    expect((await deleteSprint(s.id)).error).toMatch(/complete the active sprint/i);
    expect(await count("sprints")).toBe(1);
  });

  it("is a no-op for unknown sprints", async () => {
    await setup();
    expect(await deleteSprint(99999)).toEqual({});
  });
});
