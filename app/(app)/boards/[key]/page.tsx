import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getBoardByKey, getSprints, getTickets, getUsers } from "@/lib/queries";
import { BoardAvatar, ProgressBar } from "@/components/ui";
import Kanban from "./Kanban";
import SprintPicker from "./SprintPicker";

const fmt = (d: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—");

export default async function BoardPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ sprint?: string }> }) {
  const me = await requireUser();
  const { key } = await params;
  const { sprint: sprintParam } = await searchParams;
  const board = getBoardByKey(key);
  if (!board) notFound();

  const sprints = getSprints(board.id);
  const active = sprints.find((s) => s.status === "active");
  // Default view: the active sprint (like Jira's board), otherwise everything.
  const view = sprintParam ?? (active ? String(active.id) : "all");
  const current = /^\d+$/.test(view) ? sprints.find((s) => s.id === Number(view)) : undefined;
  const tickets = getTickets({ boardId: board.id, sprint: view === "all" ? undefined : current ? String(current.id) : view === "backlog" ? "backlog" : undefined });
  const users = getUsers();
  const done = tickets.filter((t) => t.status === "done").length;
  const daysLeft = current?.end_date ? Math.ceil((new Date(current.end_date + "T23:59:59").getTime() - Date.now()) / 86400000) : null;

  return (
    <div className="page" style={{ maxWidth: "none" }}>
      <div className="page-head">
        <BoardAvatar boardKey={board.key} color={board.color} size={44} />
        <div className="grow">
          <div className="crumbs">Boards / {board.name}</div>
          <h1>{board.name} <span className="key" style={{ fontSize: 14 }}>{board.key}</span></h1>
        </div>
        <Link className="btn" href={`/boards/${board.key}/sprints`}>🏃 Sprints &amp; backlog</Link>
      </div>

      <SprintPicker boardKey={board.key} view={view} sprints={sprints.map((s) => ({ id: s.id, name: s.name, status: s.status }))} />

      {current && (
        <div className="sprint-banner">
          <div><b>{current.name}</b> <span className={"lozenge"} style={{ ["--c" as string]: current.status === "active" ? "#2684ff" : current.status === "completed" ? "#36b37e" : "#8993a4" }}>{current.status}</span></div>
          <div className="muted small">{fmt(current.start_date)} → {fmt(current.end_date)}{current.status === "active" && daysLeft !== null ? ` · ${daysLeft >= 0 ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left` : `${-daysLeft} day${daysLeft === -1 ? "" : "s"} overdue`}` : ""}</div>
          {current.goal && <div className="small grow">🎯 {current.goal}</div>}
          <div className="row small muted" style={{ minWidth: 180 }}><div className="grow"><ProgressBar value={current.total ? Math.round((current.done / current.total) * 100) : 0} /></div>{current.done}/{current.total} done</div>
        </div>
      )}
      {view === "backlog" && <div className="sprint-banner"><b>Backlog</b><span className="muted small">{tickets.length} ticket{tickets.length === 1 ? "" : "s"} not in any sprint · {done} done</span></div>}

      <Kanban tickets={tickets} users={users} meId={me.id} showSprint={view === "all"} />
    </div>
  );
}
