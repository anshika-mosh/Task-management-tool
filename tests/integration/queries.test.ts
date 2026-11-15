import { beforeEach, describe, expect, it } from "vitest";
import {
  getBoardByKey, getBoardStats, getBoards, getComments, getOpenSprints, getRecentActivity, getSprint, getSprints, getTicketActivity,
  getTicketByKey, getTicketById, getTickets, getUsers,
} from "@/lib/queries";
import { col, now } from "@/lib/db";
import { makeBoard, makeSprint, makeTicket, makeUser, resetData } from "../helpers";

beforeEach(resetData);

describe("users & boards", () => {
  it("getUsers hides password hashes and sorts names case-insensitively", async () => {
    await makeUser({ name: "charlie" });
    await makeUser({ name: "Alice" });
    await makeUser({ name: "bob" });
    const users = await getUsers();
    expect(users.map((u) => u.name)).toEqual(["Alice", "bob", "charlie"]);
    for (const u of users) expect(u).not.toHaveProperty("password_hash");
    expect(users[0]).toHaveProperty("id");
  });

  it("getBoards sorts by name; getBoardByKey is case-insensitive", async () => {
    await makeBoard({ key: "ZED", name: "zeta" });
    await makeBoard({ key: "ALP", name: "Alpha" });
    expect((await getBoards()).map((b) => b.key)).toEqual(["ALP", "ZED"]);
    expect((await getBoardByKey("alp"))?.name).toBe("Alpha");
    expect(await getBoardByKey("nope")).toBeUndefined();
  });
});

describe("getTicketByKey / getTicketById", () => {
  it("returns an enriched ticket", async () => {
    const reporter = await makeUser({ name: "Rita Reporter" });
    const assignee = await makeUser({ name: "Alan Assignee" });
    const board = await makeBoard({ key: "WEB", name: "Website" });
    const sprint = await makeSprint(board, { name: "Sprint A", status: "active" });
    const t = await makeTicket(board, { title: "Enrich me", assignee_id: assignee.id, reporter_id: reporter.id, sprint_id: sprint.id });
    await (await col("comments")).insertMany([
      { _id: 1 as never, ticket_id: t.id, user_id: reporter.id, body: "c1", kind: "comment", hours: null, created_at: now() },
      { _id: 2 as never, ticket_id: t.id, user_id: reporter.id, body: "c2", kind: "comment", hours: null, created_at: now() },
      { _id: 3 as never, ticket_id: t.id, user_id: assignee.id, body: "p", kind: "progress", progress: 50, hours: 2.5, created_at: now() },
      { _id: 4 as never, ticket_id: t.id, user_id: assignee.id, body: "p2", kind: "progress", progress: 60, hours: 1, created_at: now() },
    ]);
    await (await col("attachments")).insertOne({ _id: 1 as never, ticket_id: t.id, user_id: 1, kind: "link", filename: "f", created_at: now() });

    const got = (await getTicketByKey("WEB-1"))!;
    expect(got).toMatchObject({
      id: t.id, key: "WEB-1", title: "Enrich me", board_key: "WEB", board_name: "Website", assignee_name: "Alan Assignee",
      reporter_name: "Rita Reporter", sprint_name: "Sprint A", sprint_status: "active", attach_count: 1, comment_count: 2, hours: 3.5,
    });
    expect((await getTicketById(t.id))?.key).toBe("WEB-1");
  });

  it("is case-insensitive on the board key and handles bad input", async () => {
    const board = await makeBoard({ key: "WEB" });
    await makeTicket(board);
    expect((await getTicketByKey("web-1"))?.key).toBe("WEB-1");
    for (const bad of ["WEB", "WEB-", "-1", "WEB-x", "NOPE-1", "WEB-99", "", "WEB-1-2"]) expect(await getTicketByKey(bad)).toBeUndefined();
    expect(await getTicketById(424242)).toBeUndefined();
  });

  it("shows nulls for unassigned / no sprint", async () => {
    const board = await makeBoard();
    await makeTicket(board);
    const t = (await getTickets())[0];
    expect(t).toMatchObject({ assignee_name: null, reporter_name: null, sprint_name: null, sprint_id: null, attach_count: 0, comment_count: 0, hours: 0 });
  });
});

describe("getTickets filters", () => {
  async function world() {
    const a = await makeUser({ name: "Ann" });
    const b = await makeUser({ name: "Bob" });
    const web = await makeBoard({ key: "WEB" });
    const mob = await makeBoard({ key: "MOB" });
    const s1 = await makeSprint(web, { name: "S1", status: "active" });
    await makeTicket(web, { title: "Login page broken", status: "todo", type: "bug", priority: "highest", assignee_id: a.id, sprint_id: s1.id });
    await makeTicket(web, { title: "Pricing redesign", description: "Compare plans table", status: "in_progress", type: "story", priority: "high", assignee_id: b.id });
    await makeTicket(web, { title: "Dark mode", status: "done", type: "task", priority: "low" });
    await makeTicket(mob, { title: "Push notifications", status: "todo", type: "story", priority: "medium", assignee_id: a.id });
    return { a, b, web, mob, s1 };
  }
  const titles = async (f: Parameters<typeof getTickets>[0]) => (await getTickets(f)).map((t) => t.title).sort();

  it("returns everything without filters", async () => {
    await world();
    expect(await titles({})).toHaveLength(4);
  });
  it("filters by board", async () => {
    const { mob } = await world();
    expect(await titles({ boardId: mob.id })).toEqual(["Push notifications"]);
  });
  it.each([
    [{ status: "todo" }, ["Login page broken", "Push notifications"]],
    [{ status: "done" }, ["Dark mode"]],
    [{ type: "story" }, ["Pricing redesign", "Push notifications"]],
    [{ priority: "highest" }, ["Login page broken"]],
  ])("filters by %j", async (f, expected) => {
    await world();
    expect(await titles(f)).toEqual(expected);
  });
  it("filters by assignee id, unassigned and mine", async () => {
    const { a } = await world();
    expect(await titles({ assignee: String(a.id) })).toEqual(["Login page broken", "Push notifications"]);
    expect(await titles({ assignee: "none" })).toEqual(["Dark mode"]);
    expect(await titles({ mine: a.id })).toEqual(["Login page broken", "Push notifications"]);
  });
  it("filters by sprint and backlog", async () => {
    const { s1 } = await world();
    expect(await titles({ sprint: String(s1.id) })).toEqual(["Login page broken"]);
    expect(await titles({ sprint: "backlog" })).toHaveLength(3);
  });
  it("combines filters", async () => {
    const { web } = await world();
    expect(await titles({ boardId: web.id, status: "todo", priority: "highest" })).toEqual(["Login page broken"]);
    expect(await titles({ boardId: web.id, status: "done", priority: "highest" })).toEqual([]);
  });
  it("searches title and description case-insensitively", async () => {
    await world();
    expect(await titles({ q: "LOGIN" })).toEqual(["Login page broken"]);
    expect(await titles({ q: "plans table" })).toEqual(["Pricing redesign"]);
  });
  it("searches by full or partial ticket key", async () => {
    await world();
    expect(await titles({ q: "WEB-2" })).toEqual(["Pricing redesign"]);
    expect(await titles({ q: "web-1" })).toEqual(["Login page broken"]);
    expect(await titles({ q: "MOB-" })).toEqual(["Push notifications"]);
    expect(await titles({ q: "WEB-" })).toHaveLength(3);
  });
  it("treats the search text literally, not as a regular expression", async () => {
    await world();
    expect(await titles({ q: ".*" })).toEqual([]);
    expect(await titles({ q: "Dark (mode" })).toEqual([]);
  });

  it("sorts by priority first, then most recently updated", async () => {
    const board = await makeBoard();
    await makeTicket(board, { title: "low-old", priority: "low", created_at: "2026-01-01T00:00:00.000Z" });
    await makeTicket(board, { title: "highest", priority: "highest", created_at: "2026-01-01T00:00:00.000Z" });
    await makeTicket(board, { title: "medium-new", priority: "medium", created_at: "2026-03-01T00:00:00.000Z" });
    await makeTicket(board, { title: "medium-old", priority: "medium", created_at: "2026-02-01T00:00:00.000Z" });
    await makeTicket(board, { title: "lowest", priority: "lowest" });
    expect((await getTickets()).map((t) => t.title)).toEqual(["highest", "medium-new", "medium-old", "low-old", "lowest"]);
  });
});

describe("getBoardStats", () => {
  it("counts tickets per status and averages progress per board", async () => {
    const web = await makeBoard({ key: "WEB", name: "Web" });
    await makeBoard({ key: "EMP", name: "Empty" });
    await makeTicket(web, { status: "todo", progress: 0 });
    await makeTicket(web, { status: "in_progress", progress: 50 });
    await makeTicket(web, { status: "in_review", progress: 90 });
    await makeTicket(web, { status: "done", progress: 100 });
    await makeTicket(web, { status: "done", progress: 100 });
    const stats = await getBoardStats();
    const w = stats.find((s) => s.key === "WEB")!;
    expect(w).toMatchObject({ total: 5, todo: 1, in_progress: 1, in_review: 1, done: 2 });
    expect(w.avg_progress).toBeCloseTo(68, 5);
    expect(stats.find((s) => s.key === "EMP")).toMatchObject({ total: 0, todo: 0, in_progress: 0, in_review: 0, done: 0, avg_progress: 0 });
  });
});

describe("comments, history & activity", () => {
  it("getComments lists newest first with author names; deleted authors show a placeholder", async () => {
    const u = await makeUser({ name: "Ann" });
    const board = await makeBoard();
    const t = await makeTicket(board);
    await (await col("comments")).insertMany([
      { _id: 1 as never, ticket_id: t.id, user_id: u.id, body: "first", kind: "comment", created_at: "2026-01-01T00:00:00.000Z" },
      { _id: 2 as never, ticket_id: t.id, user_id: 9999, body: "second", kind: "progress", progress: 10, hours: 1, created_at: "2026-01-02T00:00:00.000Z" },
    ]);
    const list = await getComments(t.id);
    expect(list.map((c) => [c.body, c.user_name])).toEqual([["second", "Deleted user"], ["first", "Ann"]]);
    expect(list[0]).toMatchObject({ kind: "progress", progress: 10, hours: 1 });
    expect(list[1]).toMatchObject({ progress: null, hours: null });
  });

  it("getTicketActivity is newest first; getRecentActivity adds ticket keys and honours the limit", async () => {
    const u = await makeUser({ name: "Ann" });
    const board = await makeBoard({ key: "WEB" });
    const t1 = await makeTicket(board, { title: "One" });
    const t2 = await makeTicket(board, { title: "Two" });
    const act = await col("activity");
    for (let i = 1; i <= 5; i++) await act.insertOne({ _id: i as never, ticket_id: i % 2 ? t1.id : t2.id, user_id: u.id, action: "changed", field: "Status", new_value: String(i), created_at: now() });
    expect((await getTicketActivity(t1.id)).map((a) => a.new_value)).toEqual(["5", "3", "1"]);
    const recent = await getRecentActivity(2);
    expect(recent.map((a) => a.id)).toEqual([5, 4]);
    expect(recent[0]).toMatchObject({ ticket_key: "WEB-1", ticket_title: "One", user_name: "Ann" });
    expect(recent[1]).toMatchObject({ ticket_key: "WEB-2" });
  });
});

describe("sprints", () => {
  it("getSprints orders active, then planned (by start date), then completed, with ticket counts", async () => {
    const board = await makeBoard();
    const done = await makeSprint(board, { name: "done", status: "completed", start_date: "2026-01-01" });
    const later = await makeSprint(board, { name: "later", status: "planned", start_date: "2026-03-01" });
    const soon = await makeSprint(board, { name: "soon", status: "planned", start_date: "2026-02-01" });
    const active = await makeSprint(board, { name: "active", status: "active", start_date: "2026-01-15" });
    await makeTicket(board, { sprint_id: active.id, status: "done" });
    await makeTicket(board, { sprint_id: active.id, status: "todo" });
    await makeTicket(board, { sprint_id: active.id, status: "in_progress" });
    void done, later, soon;
    const list = await getSprints(board.id);
    expect(list.map((s) => s.name)).toEqual(["active", "soon", "later", "done"]);
    expect(list[0]).toMatchObject({ total: 3, done: 1 });
    expect(list[1]).toMatchObject({ total: 0, done: 0 });
  });

  it("getSprints only returns the requested board's sprints", async () => {
    const a = await makeBoard();
    const b = await makeBoard();
    await makeSprint(a, { name: "A1" });
    await makeSprint(b, { name: "B1" });
    expect((await getSprints(a.id)).map((s) => s.name)).toEqual(["A1"]);
  });

  it("getOpenSprints excludes completed sprints across boards; getSprint fetches one", async () => {
    const a = await makeBoard();
    const b = await makeBoard();
    const s1 = await makeSprint(a, { name: "open A", status: "active" });
    await makeSprint(a, { name: "closed A", status: "completed" });
    await makeSprint(b, { name: "planned B" });
    expect((await getOpenSprints()).map((s) => s.name).sort()).toEqual(["open A", "planned B"]);
    expect((await getSprint(s1.id))?.name).toBe("open A");
    expect(await getSprint(99999)).toBeUndefined();
  });
});
