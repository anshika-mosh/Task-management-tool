import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getBoards, getTickets, getUsers } from "@/lib/queries";
import { PRIORITIES, STATUSES, TYPES } from "@/lib/constants";
import { Avatar, PriorityIcon, ProgressBar, StatusLozenge, TypeIcon } from "@/components/ui";
import { timeAgo } from "@/lib/format";

type SP = Record<string, string | undefined>;

export default async function Issues({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const boards = getBoards();
  const users = getUsers();
  const board = boards.find((b) => b.key === sp.board);
  const tickets = getTickets({ q: sp.q, boardId: board?.id, status: sp.status, type: sp.type, priority: sp.priority, assignee: sp.assignee === "me" ? String(me.id) : sp.assignee });

  return (
    <div className="page">
      <div className="page-head"><h1>All tickets</h1><span className="muted">{tickets.length} result{tickets.length === 1 ? "" : "s"}</span></div>
      <form className="filters" method="get">
        <input name="q" placeholder="Keyword or key…" defaultValue={sp.q} />
        <select name="board" defaultValue={sp.board ?? ""}><option value="">All boards</option>{boards.map((b) => <option key={b.id} value={b.key}>{b.name}</option>)}</select>
        <select name="status" defaultValue={sp.status ?? ""}><option value="">Any status</option>{STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        <select name="type" defaultValue={sp.type ?? ""}><option value="">Any type</option>{TYPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        <select name="priority" defaultValue={sp.priority ?? ""}><option value="">Any priority</option>{PRIORITIES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        <select name="assignee" defaultValue={sp.assignee ?? ""}><option value="">Anyone</option><option value="me">Me</option><option value="none">Unassigned</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        <button className="btn primary">Filter</button>
        <Link className="btn ghost" href="/issues">Reset</Link>
      </form>
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        {tickets.length === 0 ? <div className="empty-state">No tickets match.</div> : (
          <table>
            <thead><tr><th /><th>Key</th><th>Summary</th><th>Priority</th><th>Status</th><th>Progress</th><th>Assignee</th><th>Updated</th></tr></thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id}>
                  <td><TypeIcon type={t.type} /></td>
                  <td><Link href={`/browse/${t.key}`}>{t.key}</Link></td>
                  <td><Link href={`/browse/${t.key}`} style={{ color: "inherit" }}>{t.title}</Link></td>
                  <td><PriorityIcon priority={t.priority} label /></td>
                  <td><StatusLozenge status={t.status} /></td>
                  <td style={{ width: 120 }}><ProgressBar value={t.progress} /></td>
                  <td><span className="row"><Avatar name={t.assignee_name} color={t.assignee_color} />{t.assignee_name}</span></td>
                  <td className="muted small">{timeAgo(t.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
