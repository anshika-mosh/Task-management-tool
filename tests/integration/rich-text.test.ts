import { beforeEach, describe, expect, it } from "vitest";
import { addComment, addProgress, createTicket, updateTicket } from "@/lib/actions";
import { getComments, getTicketByKey } from "@/lib/queries";
import { toSafeHtml } from "@/lib/rich";
import { emails, fd, findAll, findOne, flushAfter, loginAs, makeBoard, makeTicket, makeUser, resetData } from "../helpers";

beforeEach(resetData);

async function setup() {
  const me = await makeUser({ name: "Me" });
  const other = await makeUser({ name: "Other" });
  await loginAs(me);
  const board = await makeBoard({ key: "RT" });
  const t = await makeTicket(board, { reporter_id: me.id, assignee_id: other.id });
  return { me, other, board, t };
}

describe("descriptions (rich text)", () => {
  it("stores formatted descriptions, with scripts and handlers stripped", async () => {
    const { t } = await setup();
    await updateTicket(t.id, "description", '<h2>Plan</h2><ul><li><p>a</p></li></ul><pre><code class="language-js">x()</code></pre><script>alert(1)</script><p onclick="x()">hi</p>');
    const stored = (await findOne("tickets", { _id: t.id }))!.description as string;
    expect(stored).toContain("<h2>Plan</h2>");
    expect(stored).toContain('<pre><code class="language-js">x()</code></pre>');
    expect(stored).not.toContain("script");
    expect(stored).not.toContain("onclick");
  });

  it("an empty editor (<p></p>) clears the description", async () => {
    const { t } = await setup();
    await updateTicket(t.id, "description", "<p>text</p>");
    await updateTicket(t.id, "description", "<p></p>");
    expect((await findOne("tickets", { _id: t.id }))?.description).toBe("");
  });

  it("is sanitized when creating a ticket, too", async () => {
    const { board } = await setup();
    await createTicket({ boardId: board.id, title: "rich", description: '<p>ok</p><iframe src="https://evil.test"></iframe>' });
    const t = (await getTicketByKey("RT-2"))!;
    expect(t.description).toBe("<p>ok</p>");
  });

  it("old plain-text descriptions still work and are shown as safe paragraphs", async () => {
    const { t } = await setup();
    await updateTicket(t.id, "description", "Line one\nLine two & <more>");
    const stored = (await findOne("tickets", { _id: t.id }))!.description as string;
    expect(toSafeHtml(stored)).toContain("Line one<br>Line two");
    expect(toSafeHtml(stored)).toContain("&amp;");
  });
});

describe("comments and progress updates (rich text)", () => {
  it("stores sanitized HTML for comments and progress notes", async () => {
    const { t } = await setup();
    await addComment(t.id, undefined, fd({ body: "<p><strong>Deployed</strong></p><script>1</script>" }));
    await addProgress(t.id, undefined, fd({ body: "<ol><li><p>step</p></li></ol><img src=x onerror=1>", progress: 20 }));
    const bodies = (await getComments(t.id)).map((c) => c.body).sort();
    expect(bodies).toContain("<p><strong>Deployed</strong></p>");
    expect(bodies.some((b) => b.startsWith("<ol><li><p>step</p></li></ol>") && !b.includes("onerror"))).toBe(true);
  });

  it("rejects content that is empty once formatting is stripped", async () => {
    const { t } = await setup();
    for (const body of ["<p></p>", "<p> </p>", "<p><br></p>", "<h1></h1>"]) {
      expect((await addComment(t.id, undefined, fd({ body })))?.error).toMatch(/write something/i);
      expect((await addProgress(t.id, undefined, fd({ body })))?.error).toMatch(/describe/i);
    }
    expect(await findAll("comments")).toHaveLength(0);
  });

  it("accepts a comment that only contains an image or a divider", async () => {
    const { t } = await setup();
    expect((await addComment(t.id, undefined, fd({ body: '<p><img src="https://cdn.test/a.png"></p>' })))?.ok).toBeTruthy();
    expect((await addComment(t.id, undefined, fd({ body: "<hr>" })))?.ok).toBeTruthy();
  });

  it("media links inserted by the attach icon survive (Drive id + media type)", async () => {
    const { t } = await setup();
    const body = '<p><a href="https://drive.google.com/file/d/ABCDEFGHIJKL/view" class="media-link" data-drive-id="ABCDEFGHIJKL" data-media="drive">Mockup.png</a></p>';
    await addComment(t.id, undefined, fd({ body }));
    const stored = (await getComments(t.id))[0].body;
    expect(stored).toContain('data-drive-id="ABCDEFGHIJKL"');
    expect(stored).toContain('data-media="drive"');
    expect(stored).toContain("Mockup.png");
  });

  it("emails about progress updates contain the formatted note", async () => {
    const { me, t } = await setup();
    void me;
    await addProgress(t.id, undefined, fd({ body: "<p>Did <strong>a lot</strong></p>", progress: 30, hours: 1 }));
    await flushAfter();
    const [mail] = await emails();
    expect(mail.html).toContain("<strong>a lot</strong>");
  });
});
