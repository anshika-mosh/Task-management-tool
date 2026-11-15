import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it } from "vitest";
import { createUser, deleteUser, setUserRole } from "@/lib/actions";
import { col, now } from "@/lib/db";
import { count, expectRedirect, fd, findOne, loginAs, makeAdmin, makeBoard, makeTicket, makeUser, resetData } from "../helpers";

beforeEach(resetData);

describe("createUser", () => {
  it("lets an admin add a member with a hashed password and lowercased email", async () => {
    await loginAs(await makeAdmin());
    const res = await createUser(undefined, fd({ name: "New Person", email: "New.Person@Test.dev", password: "abcdef", role: "member" }));
    expect(res).toEqual({ ok: "New Person added." });
    const u = await findOne("users", { email: "new.person@test.dev" });
    expect(u).toMatchObject({ name: "New Person", role: "member" });
    expect(u!.password_hash).not.toBe("abcdef");
    expect(bcrypt.compareSync("abcdef", u!.password_hash)).toBe(true);
  });

  it("can create another admin; unknown roles become member", async () => {
    await loginAs(await makeAdmin());
    await createUser(undefined, fd({ name: "A", email: "a@test.dev", password: "abcdef", role: "admin" }));
    await createUser(undefined, fd({ name: "B", email: "b@test.dev", password: "abcdef", role: "superuser" }));
    expect((await findOne("users", { email: "a@test.dev" }))?.role).toBe("admin");
    expect((await findOne("users", { email: "b@test.dev" }))?.role).toBe("member");
  });

  it.each([
    [{ name: "", email: "a@test.dev", password: "abcdef" }, /valid email/i],
    [{ name: "A", email: "not-an-email", password: "abcdef" }, /valid email/i],
    [{ name: "A", email: "a@test.dev", password: "12345" }, /at least 6/i],
  ])("validates input %#", async (input, msg) => {
    await loginAs(await makeAdmin());
    expect((await createUser(undefined, fd(input)))?.error).toMatch(msg);
    expect(await count("users")).toBe(1); // only the admin
  });

  it("refuses duplicate emails regardless of case", async () => {
    await loginAs(await makeAdmin());
    await makeUser({ email: "taken@test.dev" });
    expect((await createUser(undefined, fd({ name: "X", email: "TAKEN@test.dev", password: "abcdef" })))?.error).toMatch(/already registered/i);
  });

  it("is admin-only", async () => {
    await loginAs(await makeUser());
    await expectRedirect(() => createUser(undefined, fd({ name: "X", email: "x@test.dev", password: "abcdef" })), "/");
    expect(await count("users")).toBe(1);
  });
});

describe("setUserRole", () => {
  it("promotes and demotes other users", async () => {
    await loginAs(await makeAdmin());
    const u = await makeUser();
    await setUserRole(u.id, "admin");
    expect((await findOne("users", { _id: u.id }))?.role).toBe("admin");
    await setUserRole(u.id, "member");
    expect((await findOne("users", { _id: u.id }))?.role).toBe("member");
  });

  it("never lets an admin change their own role (no accidental lock-out)", async () => {
    const me = await makeAdmin();
    await loginAs(me);
    await setUserRole(me.id, "member");
    expect((await findOne("users", { _id: me.id }))?.role).toBe("admin");
  });

  it("rejects bogus role values", async () => {
    await loginAs(await makeAdmin());
    const u = await makeUser();
    await setUserRole(u.id, "root" as never);
    expect((await findOne("users", { _id: u.id }))?.role).toBe("member");
  });

  it("is admin-only", async () => {
    const victim = await makeUser();
    await loginAs(await makeUser());
    await expectRedirect(() => setUserRole(victim.id, "admin"), "/");
  });
});

describe("deleteUser", () => {
  it("removes the user, their comments/history/attachments and unassigns their tickets", async () => {
    const admin = await makeAdmin();
    const doomed = await makeUser();
    const other = await makeUser();
    await loginAs(admin);
    const board = await makeBoard();
    const t = await makeTicket(board, { assignee_id: doomed.id, reporter_id: doomed.id });
    const t2 = await makeTicket(board, { assignee_id: other.id, reporter_id: other.id });
    await (await col("comments")).insertMany([
      { _id: 1 as never, ticket_id: t2.id, user_id: doomed.id, body: "bye", kind: "comment", created_at: now() },
      { _id: 2 as never, ticket_id: t2.id, user_id: other.id, body: "stay", kind: "comment", created_at: now() },
    ]);
    await (await col("activity")).insertOne({ _id: 1 as never, ticket_id: t2.id, user_id: doomed.id, action: "created", created_at: now() });
    await (await col("attachments")).insertOne({ _id: 1 as never, ticket_id: t2.id, user_id: doomed.id, kind: "link", url: "https://x.test", filename: "l", created_at: now() });

    await deleteUser(doomed.id);

    expect(await count("users", { _id: doomed.id })).toBe(0);
    expect(await count("comments", { user_id: doomed.id })).toBe(0);
    expect(await count("activity", { user_id: doomed.id })).toBe(0);
    expect(await count("attachments", { user_id: doomed.id })).toBe(0);
    expect(await findOne("tickets", { _id: t.id })).toMatchObject({ assignee_id: null, reporter_id: null });
    expect(await findOne("tickets", { _id: t2.id })).toMatchObject({ assignee_id: other.id });
    expect(await count("comments", { user_id: other.id })).toBe(1);
  });

  it("an admin cannot delete themselves", async () => {
    const me = await makeAdmin();
    await loginAs(me);
    await deleteUser(me.id);
    expect(await count("users", { _id: me.id })).toBe(1);
  });

  it("is admin-only", async () => {
    const victim = await makeUser();
    await loginAs(await makeUser());
    await expectRedirect(() => deleteUser(victim.id), "/");
    expect(await count("users", { _id: victim.id })).toBe(1);
  });
});
