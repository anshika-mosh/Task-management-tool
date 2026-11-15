import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getBoardStats, getRecentActivity, getTickets } from "@/lib/queries";
import { STATUSES } from "@/lib/constants";
import { BoardAvatar, PriorityIcon, ProgressBar, StatusLozenge, TypeIcon } from "@/components/ui";
import ActivityLine from "@/components/ActivityLine";

export default async function Home() {
  const user = await requireUser();
  const boards = getBoardStats();
  const mine = getTickets({ mine: user.id }).filter((t) => t.status !== "done");
  const activity = getRecentActivity(10);
  const sum = (k: "total" | "todo" | "in_progress" | "in_review" | "done") => boards.reduce((n, b) => n + b[k], 0);
  const total = sum("total");
  const donePct = total ? Math.round((sum("done") / total) * 100) : 0;

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1>Welcome back, {user.name.split(" ")[0]} 👋</h1>
          <div className="muted">Everything happening across all team boards.</div>
        </div>
        {user.role === "admin" && <Link className="btn" href="/admin">Manage boards</Link>}
      </div>

      <div className="grid cols-4">
        <div className="card stat"><b>{boards.length}</b><span>Boards</span></div>
        <div className="card stat"><b>{total}</b><span>Total tickets</span></div>
        <div className="card stat"><b style={{ color: "#2684ff" }}>{sum("in_progress") + sum("in_review")}</b><span>In flight</span></div>
        <div className="card stat"><b style={{ color: "#36b37e" }}>{donePct}%</b><span>Completed ({sum("done")})</span></div>
      </div>

      <h2 style={{ margin: "28px 0 12px" }}>Boards</h2>
      {boards.length === 0 ? (
        <div className="card empty-state">
          No boards yet. {user.role === "admin" ? <Link href="/admin">Create the first board →</Link> : "Ask an admin to create one."}
        </div>
      ) : (
        <div className="grid cols-3">
          {boards.map((b) => (
            <Link key={b.id} href={`/boards/${b.key}`} className="card board-card">
              <div className="row">
                <BoardAvatar boardKey={b.key} color={b.color} size={40} />
                <div className="grow"><h2>{b.name}</h2><span className="muted small">{b.key} · {b.total} ticket{b.total === 1 ? "" : "s"}</span></div>
              </div>
              {b.description && <p className="muted small" style={{ margin: "10px 0 0" }}>{b.description}</p>}
              <div className="stack-bar" title="Ticket status breakdown">
                {STATUSES.map((s) => b.total > 0 && <div key={s.id} style={{ width: `${(b[s.id] / b.total) * 100}%`, background: s.color }} />)}
              </div>
              <div className="legend">
                {STATUSES.map((s) => <span key={s.id}><i className="dot" style={{ background: s.color }} />{s.label} <b>{b[s.id]}</b></span>)}
              </div>
              <div className="row small muted" style={{ marginTop: 12 }}>
                <span>Avg progress</span><div className="grow"><ProgressBar value={Math.round(b.avg_progress)} /></div><span>{Math.round(b.avg_progress)}%</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="home-split">
        <section>
          <h2 style={{ marginBottom: 12 }}>Assigned to you ({mine.length})</h2>
          <div className="card" style={{ padding: 0 }}>
            {mine.length === 0 ? <div className="empty-state">Nothing assigned to you. Enjoy the calm ☕</div> : (
              <table>
                <tbody>
                  {mine.map((t) => (
                    <tr key={t.id}>
                      <td style={{ width: 28 }}><TypeIcon type={t.type} /></td>
                      <td><Link href={`/browse/${t.key}`}><span className="key">{t.key}</span> {t.title}</Link></td>
                      <td><PriorityIcon priority={t.priority} /></td>
                      <td><StatusLozenge status={t.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
        <section>
          <h2 style={{ marginBottom: 12 }}>Recent activity</h2>
          <div className="card">
            {activity.length === 0 ? <div className="empty-state">No activity yet.</div> : activity.map((a) => <ActivityLine key={a.id} a={a} showTicket />)}
          </div>
        </section>
      </div>
    </div>
  );
}
