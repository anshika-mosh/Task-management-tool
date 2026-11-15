import { beforeEach, describe, expect, it } from "vitest";
import { addComment, addLinkAttachment, addProgress, createTicket, updateTicket } from "@/lib/actions";
import { col } from "@/lib/db";
import { emails, fd, flushAfter, loginAs, makeBoard, makeSprint, makeTicket, makeUser, resetData } from "../helpers";

beforeEach(resetData);

/**
 * Notification rules:
 *  1. Ticket assigned/reassigned to someone  -> the new assignee.
 *  2. Someone OTHER than the assignee comments/updates -> the assignee, with what was posted.
 *  3. The assignee comments/updates -> the reporter, with what was posted.
 *  4. You never get mail about your own action. Sprint planning sends no mail.
 */
async function world() {
  const rita = await makeUser({ name: "Rita Reporter", email: "rita@test.dev" }); // reporter
  const alan = await makeUser({ name: "Alan Assignee", email: "alan@test.dev" }); // assignee
  const olga = await makeUser({ name: "Olga Other", email: "olga@test.dev" }); // bystander
  const board = await makeBoard({ key: "ML" });
  const t = await makeTicket(board, { title: "Fix <login> & \"logout\"", reporter_id: rita.id, assignee_id: alan.id, status: "todo" });
  return { rita, alan, olga, board, t };
}
const sent = async () => {
  await flushAfter();
  return emails();
};
const toList = async () => (await sent()).map((e) => e.to_email);

describe("1. assignment emails", () => {
  it("assigning a ticket emails the new assignee", async () => {
    const { rita, alan, board } = await world();
    const t = await makeTicket(board, { title: "Unassigned one", reporter_id: rita.id });
    await loginAs(rita);
    await updateTicket(t.id, "assignee_id", alan.id);
    const [mail, ...rest] = await sent();
    expect(rest).toHaveLength(0);
    expect(mail).toMatchObject({
      to_email: "alan@test.dev", to_name: "Alan Assignee", subject: `[ML-2] Rita Reporter assigned you: Unassigned one`, ticket_key: "ML-2", status: "logged",
    });
    expect(mail.html).toContain("A ticket was assigned to you");
    expect(mail.html).toContain("Rita Reporter");
    expect(mail.html).toContain("http://localhost:3000/browse/ML-2");
  });

  it("reassigning notifies only the new assignee", async () => {
    const { rita, olga, t } = await world();
    await loginAs(rita);
    await updateTicket(t.id, "assignee_id", olga.id);
    expect(await toList()).toEqual(["olga@test.dev"]);
  });

  it("assigning a ticket to yourself sends nothing", async () => {
    const { board, alan } = await world();
    const t = await makeTicket(board, { reporter_id: alan.id });
    await loginAs(alan);
    await updateTicket(t.id, "assignee_id", alan.id);
    expect(await toList()).toEqual([]);
  });

  it("unassigning sends nothing", async () => {
    const { rita, t } = await world();
    await loginAs(rita);
    await updateTicket(t.id, "assignee_id", null);
    expect(await toList()).toEqual([]);
  });

  it("creating a ticket already assigned to someone else emails them", async () => {
    const { rita, alan, board } = await world();
    await loginAs(rita);
    await createTicket({ boardId: board.id, title: "Brand new", assigneeId: alan.id });
    const [mail] = await sent();
    expect(mail).toMatchObject({ to_email: "alan@test.dev", subject: "[ML-2] Rita Reporter assigned you: Brand new" });
  });

  it("creating unassigned or self-assigned tickets sends nothing", async () => {
    const { rita, board } = await world();
    await loginAs(rita);
    await createTicket({ boardId: board.id, title: "Unassigned" });
    await createTicket({ boardId: board.id, title: "Mine", assigneeId: rita.id });
    expect(await toList()).toEqual([]);
  });
});

describe("2. someone else updates -> the assignee gets the mail", () => {
  it("a comment emails the assignee with the comment text", async () => {
    const { rita, t } = await world();
    await loginAs(rita);
    await addComment(t.id, undefined, fd({ body: "Please check the Safari build" }));
    const mails = await sent();
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ to_email: "alan@test.dev", subject: "[ML-1] Rita Reporter commented", ticket_key: "ML-1" });
    expect(mails[0].html).toContain("Please check the Safari build");
    expect(mails[0].html).toContain("on a ticket assigned to you");
  });

  it("a comment from a bystander emails the assignee, not the reporter", async () => {
    const { olga, t } = await world();
    await loginAs(olga);
    await addComment(t.id, undefined, fd({ body: "+1" }));
    expect(await toList()).toEqual(["alan@test.dev"]);
  });

  it("a progress update emails the assignee with the note, percentage and hours", async () => {
    const { rita, t } = await world();
    await loginAs(rita);
    await addProgress(t.id, undefined, fd({ body: "Reviewed the design", progress: 60, hours: 2 }));
    const [mail] = await sent();
    expect(mail.to_email).toBe("alan@test.dev");
    expect(mail.subject).toBe("[ML-1] Rita Reporter posted a progress update (60% complete, 2h logged)");
    expect(mail.html).toContain("Reviewed the design");
  });

  it("changing a field (status) emails the assignee what changed", async () => {
    const { rita, t } = await world();
    await loginAs(rita);
    await updateTicket(t.id, "status", "done");
    const [mail] = await sent();
    expect(mail).toMatchObject({ to_email: "alan@test.dev", subject: "[ML-1] Rita Reporter changed Status from todo to done" });
  });

  it("changing priority and due date also notify", async () => {
    const { rita, t } = await world();
    await loginAs(rita);
    await updateTicket(t.id, "priority", "highest");
    await updateTicket(t.id, "due_date", "2026-12-24");
    const subjects = (await sent()).map((e) => e.subject);
    expect(subjects).toEqual(["[ML-1] Rita Reporter changed Priority from medium to highest", "[ML-1] Rita Reporter changed Due date from none to 2026-12-24"]);
  });

  it("editing the description notifies without dumping the text", async () => {
    const { rita, t } = await world();
    await loginAs(rita);
    await updateTicket(t.id, "description", "Some secret new description");
    const [mail] = await sent();
    expect(mail.subject).toBe("[ML-1] Rita Reporter updated the description");
  });

  it("attaching a link notifies the assignee", async () => {
    const { rita, t } = await world();
    await loginAs(rita);
    await addLinkAttachment(t.id, undefined, fd({ url: "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrSt/view", name: "Mockup.png" }));
    const [mail] = await sent();
    expect(mail).toMatchObject({ to_email: "alan@test.dev", subject: "[ML-1] Rita Reporter attached Mockup.png" });
  });
});

describe("3. the assignee updates -> the reporter gets the mail", () => {
  it("assignee comments: the reporter is told what was posted (and the assignee gets nothing)", async () => {
    const { alan, t } = await world();
    await loginAs(alan);
    await addComment(t.id, undefined, fd({ body: "Fixed in PR #12" }));
    const mails = await sent();
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ to_email: "rita@test.dev", subject: "[ML-1] Alan Assignee commented" });
    expect(mails[0].html).toContain("Fixed in PR #12");
    expect(mails[0].html).toContain("The assignee");
  });

  it("assignee posts a progress update: the reporter gets it with details", async () => {
    const { alan, t } = await world();
    await loginAs(alan);
    await addProgress(t.id, undefined, fd({ body: "Exported 42 posts", progress: 80, hours: 3.5 }));
    const [mail] = await sent();
    expect(mail.to_email).toBe("rita@test.dev");
    expect(mail.subject).toBe("[ML-1] Alan Assignee posted a progress update (80% complete, 3.5h logged)");
    expect(mail.html).toContain("Exported 42 posts");
  });

  it("assignee changes the status: the reporter is notified", async () => {
    const { alan, t } = await world();
    await loginAs(alan);
    await updateTicket(t.id, "status", "in_review");
    expect(await sent()).toMatchObject([{ to_email: "rita@test.dev", subject: "[ML-1] Alan Assignee changed Status from todo to in_review" }]);
  });

  it("when the reporter is also the assignee nobody is mailed about their own work", async () => {
    const { rita, board } = await world();
    const t = await makeTicket(board, { reporter_id: rita.id, assignee_id: rita.id });
    await loginAs(rita);
    await addComment(t.id, undefined, fd({ body: "note to self" }));
    await updateTicket(t.id, "status", "in_progress");
    expect(await toList()).toEqual([]);
  });
});

describe("unassigned tickets", () => {
  it("others' updates go to the reporter; the reporter's own updates go to nobody", async () => {
    const { rita, olga, board } = await world();
    const t = await makeTicket(board, { reporter_id: rita.id, assignee_id: null });
    await loginAs(olga);
    await addComment(t.id, undefined, fd({ body: "any news?" }));
    expect(await toList()).toEqual(["rita@test.dev"]);
    await loginAs(rita);
    await addComment(t.id, undefined, fd({ body: "working on it" }));
    expect(await toList()).toEqual(["rita@test.dev"]); // unchanged: no new mail
  });
});

describe("4. things that must NOT send mail", () => {
  it("sprint planning (moving tickets between sprints) is silent", async () => {
    const { rita, board, t } = await world();
    const s = await makeSprint(board);
    await loginAs(rita);
    await updateTicket(t.id, "sprint_id", s.id);
    await updateTicket(t.id, "sprint_id", null);
    expect(await toList()).toEqual([]);
  });

  it("no-op updates (same value) are silent", async () => {
    const { rita, t } = await world();
    await loginAs(rita);
    await updateTicket(t.id, "status", "todo");
    expect(await toList()).toEqual([]);
  });

  it("invalid updates are silent", async () => {
    const { rita, t } = await world();
    await loginAs(rita);
    await updateTicket(t.id, "status", "bogus");
    await addComment(t.id, undefined, fd({ body: "" }));
    expect(await toList()).toEqual([]);
  });
});

describe("email content & robustness", () => {
  it("escapes HTML in titles and comment bodies (no injection into emails)", async () => {
    const { rita, t } = await world();
    await loginAs(rita);
    await addComment(t.id, undefined, fd({ body: '<script>alert("x")</script> & <img src=x onerror=1>' }));
    const [mail] = await sent();
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).not.toContain("<img src=x");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.html).toContain("Fix &lt;login&gt; &amp; &quot;logout&quot;");
  });

  it("stores each email in the outbox in order with a timestamp", async () => {
    const { rita, t } = await world();
    await loginAs(rita);
    await addComment(t.id, undefined, fd({ body: "one" }));
    await flushAfter();
    await addComment(t.id, undefined, fd({ body: "two" }));
    const list = await sent();
    expect(list).toHaveLength(2);
    expect(list.map((e) => e._id)).toEqual([1, 2]);
    expect(list[0].created_at).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(list.every((e) => e.status === "logged" && e.error === null)).toBe(true);
  });

  it("silently skips mail if the ticket was deleted before the mail job ran", async () => {
    const { rita, t } = await world();
    await loginAs(rita);
    await addComment(t.id, undefined, fd({ body: "bye" }));
    await (await col("tickets")).deleteOne({ _id: t.id as never });
    await expect(flushAfter()).resolves.toBeUndefined();
    expect(await emails()).toHaveLength(0);
  });

  it("skips mail when the assignee account no longer exists", async () => {
    const { rita, board } = await world();
    const t = await makeTicket(board, { reporter_id: rita.id, assignee_id: 424242 });
    await loginAs(rita);
    await addComment(t.id, undefined, fd({ body: "hello?" }));
    await expect(flushAfter()).resolves.toBeUndefined();
    expect(await emails()).toHaveLength(0);
  });
});
