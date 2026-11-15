import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getEmails } from "@/lib/queries";
import { smtpConfigured } from "@/lib/mail";
import { timeAgo, fullDate } from "@/lib/format";

const COLORS: Record<string, string> = { sent: "#36b37e", failed: "#de350b", logged: "#2684ff", queued: "#8993a4" };

export default async function MailOutbox() {
  await requireAdmin();
  const emails = getEmails(100);
  const smtp = smtpConfigured();
  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <div className="crumbs"><Link href="/admin">Admin</Link> / Mail</div>
          <h1>Mail outbox</h1>
        </div>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        {smtp ? (
          <>✅ SMTP is configured (<code>{process.env.SMTP_HOST}</code>). Notifications are delivered to real inboxes and listed here.</>
        ) : (
          <>
            ℹ️ <b>No SMTP server configured</b> — emails are <b>recorded here instead of being delivered</b> (status “logged”).
            To send real mail, set <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code> and <code>MAIL_FROM</code> in <code>.env.local</code> and restart. See the README.
          </>
        )}
      </div>
      <div className="card" style={{ padding: 0 }}>
        {emails.length === 0 ? (
          <div className="empty-state">No emails yet. Assign a ticket to someone else or comment on a ticket assigned to another user.</div>
        ) : (
          emails.map((m) => (
            <details key={m.id} className="mail">
              <summary>
                <span className="lozenge" style={{ ["--c" as string]: COLORS[m.status] ?? "#8993a4" }}>{m.status}</span>
                <span className="grow"><b>{m.subject}</b><br /><span className="muted small">to {m.to_name} &lt;{m.to_email}&gt;</span></span>
                <span className="muted small" title={fullDate(m.created_at)}>{timeAgo(m.created_at)}</span>
              </summary>
              <div style={{ padding: "8px 12px 14px" }}>
                {m.error && <p className="err">Error: {m.error}</p>}
                <iframe className="mail-frame" sandbox="" srcDoc={m.html} title={m.subject} />
              </div>
            </details>
          ))
        )}
      </div>
    </div>
  );
}
