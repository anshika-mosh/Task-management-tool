import { beforeEach, describe, expect, it, vi } from "vitest";
import { emails, flushAfter, makeBoard, makeTicket, makeUser, resetData } from "../helpers";

// Replace the real SMTP transport so no network is touched.
const smtp = vi.hoisted(() => ({
  sendMail: vi.fn(async (_msg: unknown) => ({ messageId: "x" })),
  createTransport: vi.fn(),
}));
vi.mock("nodemailer", () => {
  smtp.createTransport.mockImplementation(() => ({ sendMail: smtp.sendMail }));
  return { default: { createTransport: smtp.createTransport } };
});

beforeEach(async () => {
  await resetData();
  smtp.sendMail.mockReset().mockResolvedValue({ messageId: "x" });
  smtp.createTransport.mockClear();
  vi.resetModules(); // mail.ts caches its transport at module level
  for (const k of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_SECURE", "MAIL_FROM"]) delete process.env[k];
});

async function scenario() {
  const actor = await makeUser({ name: "Actor", email: "actor@test.dev" });
  const assignee = await makeUser({ name: "Assignee", email: "assignee@test.dev" });
  const board = await makeBoard({ key: "SM" });
  const t = await makeTicket(board, { title: "SMTP ticket", assignee_id: assignee.id, reporter_id: actor.id });
  const mail = await import("@/lib/mail");
  return { actor, assignee, t, mail };
}

describe("smtpConfigured", () => {
  it("reflects whether SMTP_HOST is set", async () => {
    const { mail } = await scenario();
    expect(mail.smtpConfigured()).toBe(false);
    process.env.SMTP_HOST = "smtp.test";
    expect(mail.smtpConfigured()).toBe(true);
  });
});

describe("delivery through SMTP", () => {
  it("sends the message to the assignee and marks it sent", async () => {
    process.env.SMTP_HOST = "smtp.test";
    process.env.MAIL_FROM = "TaskFlow <noreply@acme.test>";
    const { actor, t, mail } = await scenario();
    mail.notifyActivity(t.id, actor.id, "commented", "hello team");
    await flushAfter();
    expect(smtp.sendMail).toHaveBeenCalledTimes(1);
    const msg = smtp.sendMail.mock.calls[0][0] as { from: string; to: string; subject: string; html: string };
    expect(msg.from).toBe("TaskFlow <noreply@acme.test>");
    expect(msg.to).toBe("Assignee <assignee@test.dev>");
    expect(msg.subject).toBe("[SM-1] Actor commented");
    expect(msg.html).toContain("hello team");
    expect((await emails())[0]).toMatchObject({ status: "sent", error: null, to_email: "assignee@test.dev" });
  });

  it("uses a default From address when MAIL_FROM is not set", async () => {
    process.env.SMTP_HOST = "smtp.test";
    const { actor, t, mail } = await scenario();
    mail.notifyAssigned(t.id, actor.id);
    await flushAfter();
    expect((smtp.sendMail.mock.calls[0][0] as { from: string }).from).toBe("TaskFlow <no-reply@taskflow.local>");
  });

  it("builds the transport from SMTP_* settings (defaults: port 587, no TLS, no auth)", async () => {
    process.env.SMTP_HOST = "smtp.test";
    const { actor, t, mail } = await scenario();
    mail.notifyAssigned(t.id, actor.id);
    await flushAfter();
    expect(smtp.createTransport).toHaveBeenCalledWith({ host: "smtp.test", port: 587, secure: false, auth: undefined });
  });

  it("supports TLS on port 465 and username/password auth", async () => {
    Object.assign(process.env, { SMTP_HOST: "smtp.test", SMTP_PORT: "465", SMTP_USER: "bot", SMTP_PASS: "pw" });
    const { actor, t, mail } = await scenario();
    mail.notifyAssigned(t.id, actor.id);
    await flushAfter();
    expect(smtp.createTransport).toHaveBeenCalledWith({ host: "smtp.test", port: 465, secure: true, auth: { user: "bot", pass: "pw" } });
  });

  it("a failing SMTP server marks the email failed with the reason, and never throws", async () => {
    process.env.SMTP_HOST = "smtp.test";
    smtp.sendMail.mockRejectedValue(new Error("550 mailbox unavailable"));
    const { actor, t, mail } = await scenario();
    mail.notifyActivity(t.id, actor.id, "commented", "x");
    await expect(flushAfter()).resolves.toBeUndefined();
    expect((await emails())[0]).toMatchObject({ status: "failed", error: "550 mailbox unavailable" });
  });

  it("without SMTP_HOST nothing is sent, but the email is still recorded as logged", async () => {
    const { actor, t, mail } = await scenario();
    mail.notifyActivity(t.id, actor.id, "commented", "x");
    await flushAfter();
    expect(smtp.sendMail).not.toHaveBeenCalled();
    expect((await emails())[0].status).toBe("logged");
  });
});
