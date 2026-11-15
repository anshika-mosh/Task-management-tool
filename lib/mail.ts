import nodemailer, { type Transporter } from "nodemailer";
import { after } from "next/server";
import { get, run } from "./db";
import { priorityOf, statusOf } from "./constants";

/**
 * Email notifications.
 *  - SMTP_HOST set  -> sent for real through nodemailer.
 *  - SMTP_HOST unset -> "outbox mode": the email is only recorded (see Admin → Mail outbox) and logged.
 * Every message is stored in the `emails` table either way.
 */

const APP_URL = () => (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
const FROM = () => process.env.MAIL_FROM || "TaskFlow <no-reply@taskflow.local>";
export const smtpConfigured = () => !!process.env.SMTP_HOST;

let transport: Transporter | null = null;
function getTransport() {
  if (!process.env.SMTP_HOST) return null;
  return (transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true" || process.env.SMTP_PORT === "465",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  }));
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

type TicketRow = {
  id: number; key: string; title: string; description: string; status: string; priority: string;
  assignee_id: number | null; reporter_id: number | null;
};
type UserRow = { id: number; name: string; email: string };

const loadTicket = (id: number) =>
  get<TicketRow>(
    "SELECT t.id, b.key || '-' || t.number AS key, t.title, t.description, t.status, t.priority, t.assignee_id, t.reporter_id FROM tickets t JOIN boards b ON b.id = t.board_id WHERE t.id = ?",
    id,
  );
const loadUser = (id: number | null) => (id ? get<UserRow>("SELECT id,name,email FROM users WHERE id = ?", id) : undefined);

function layout(opts: { heading: string; intro: string; t: TicketRow; bodyHtml?: string }) {
  const { t } = opts;
  const link = `${APP_URL()}/browse/${t.key}`;
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#172b4d">
<div style="max-width:560px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #dfe1e6">
  <div style="background:#0c66e4;color:#fff;padding:14px 20px;font-weight:700">✓ TaskFlow</div>
  <div style="padding:20px">
    <h2 style="margin:0 0 6px;font-size:18px">${esc(opts.heading)}</h2>
    <p style="margin:0 0 16px;color:#44546f">${opts.intro}</p>
    <div style="border:1px solid #dfe1e6;border-radius:6px;padding:12px 14px;margin-bottom:16px">
      <a href="${link}" style="color:#0c66e4;font-weight:700;text-decoration:none">${esc(t.key)}</a>
      <div style="font-size:16px;margin:2px 0 8px">${esc(t.title)}</div>
      <span style="background:#e9f2ff;border-radius:3px;padding:1px 6px;font-size:12px;font-weight:700">${esc(statusOf(t.status).label)}</span>
      <span style="font-size:12px;color:#6b778c;margin-left:6px">Priority: ${esc(priorityOf(t.priority).label)}</span>
    </div>
    ${opts.bodyHtml ?? ""}
    <a href="${link}" style="display:inline-block;background:#0c66e4;color:#fff;text-decoration:none;font-weight:600;padding:8px 14px;border-radius:4px">Open ${esc(t.key)}</a>
  </div>
</div></body></html>`;
}

const quote = (text: string) =>
  `<blockquote style="margin:0 0 16px;padding:8px 14px;border-left:3px solid #36b37e;background:#f0faf5;white-space:pre-wrap">${esc(text)}</blockquote>`;

async function deliver(to: UserRow, subject: string, html: string, ticketKey: string) {
  const row = run("INSERT INTO emails (to_email,to_name,subject,html,ticket_key) VALUES (?,?,?,?,?)", to.email, to.name, subject, html, ticketKey);
  const id = Number(row.lastInsertRowid);
  const tr = getTransport();
  if (!tr) {
    run("UPDATE emails SET status = 'logged' WHERE id = ?", id);
    console.log(`[mail:outbox] to=${to.email} subject="${subject}"`);
    return;
  }
  try {
    await tr.sendMail({ from: FROM(), to: `${to.name} <${to.email}>`, subject, html });
    run("UPDATE emails SET status = 'sent' WHERE id = ?", id);
  } catch (e) {
    run("UPDATE emails SET status = 'failed', error = ? WHERE id = ?", String((e as Error).message).slice(0, 500), id);
    console.error("[mail] send failed:", (e as Error).message);
  }
}

/** Run after the response is sent; never let mail problems break the user's action. */
function later(fn: () => Promise<void>) {
  const safe = () => fn().catch((e) => console.error("[mail]", e));
  try { after(safe); } catch { void safe(); }
}

/** The ticket was assigned (or reassigned) to someone: tell the new assignee. */
export function notifyAssigned(ticketId: number, actorId: number) {
  later(async () => {
    const t = loadTicket(ticketId);
    const actor = loadUser(actorId);
    const to = loadUser(t?.assignee_id ?? null);
    if (!t || !to || !actor || to.id === actor.id) return; // nobody needs an email about assigning themselves
    await deliver(
      to,
      `[${t.key}] ${actor.name} assigned you: ${t.title}`,
      layout({
        heading: "A ticket was assigned to you",
        intro: `<b>${esc(actor.name)}</b> assigned this ticket to you.`,
        t,
        bodyHtml: t.description ? quote(t.description.slice(0, 600)) : undefined,
      }),
      t.key,
    );
  });
}

/**
 * Something happened on a ticket (comment, progress update, field change, attachment).
 *  - Someone other than the assignee did it  -> the assignee gets the mail.
 *  - The assignee did it                      -> the reporter (who handed the work over) gets the mail.
 *  - The actor never gets mail about their own action.
 */
export function notifyActivity(ticketId: number, actorId: number, what: string, posted?: string) {
  later(async () => {
    const t = loadTicket(ticketId);
    const actor = loadUser(actorId);
    if (!t || !actor) return;
    let to: UserRow | undefined;
    let intro = "";
    if (t.assignee_id && t.assignee_id !== actorId) {
      to = loadUser(t.assignee_id);
      intro = `<b>${esc(actor.name)}</b> ${esc(what)} on a ticket assigned to you.`;
    } else if (t.reporter_id && t.reporter_id !== actorId) {
      to = loadUser(t.reporter_id);
      intro = t.assignee_id === actorId
        ? `The assignee, <b>${esc(actor.name)}</b>, ${esc(what)}.`
        : `<b>${esc(actor.name)}</b> ${esc(what)} on a ticket you reported.`;
    }
    if (!to) return;
    await deliver(
      to,
      `[${t.key}] ${actor.name} ${what}`,
      layout({ heading: `${t.key} was updated`, intro, t, bodyHtml: posted ? quote(posted.slice(0, 2000)) : undefined }),
      t.key,
    );
  });
}
