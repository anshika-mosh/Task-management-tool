import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getBoardByKey, getSprints, getTickets } from "@/lib/queries";
import { BoardAvatar } from "@/components/ui";
import { CreateSprint, SprintCard } from "./SprintsClient";

export default async function SprintsPage({ params }: { params: Promise<{ key: string }> }) {
  await requireUser();
  const { key } = await params;
  const board = getBoardByKey(key);
  if (!board) notFound();
  const sprints = getSprints(board.id);
  const tickets = getTickets({ boardId: board.id });
  const open = sprints.filter((s) => s.status !== "completed").map((s) => ({ id: s.id, name: s.name }));
  const slim = (t: (typeof tickets)[number]) => ({
    id: t.id, key: t.key, title: t.title, type: t.type, status: t.status, priority: t.priority,
    assignee_name: t.assignee_name, assignee_color: t.assignee_color, sprint_id: t.sprint_id,
  });
  const group = (id: number | null) => tickets.filter((t) => t.sprint_id === id).map(slim);
  const completed = sprints.filter((s) => s.status === "completed");

  return (
    <div className="page">
      <div className="page-head">
        <BoardAvatar boardKey={board.key} color={board.color} size={40} />
        <div className="grow">
          <div className="crumbs"><Link href={`/boards/${board.key}`}>{board.name}</Link> / Sprints</div>
          <h1>Sprints &amp; backlog</h1>
        </div>
        <Link className="btn" href={`/boards/${board.key}`}>← Back to board</Link>
      </div>

      <CreateSprint boardId={board.id} boardKey={board.key} nextNumber={sprints.length + 1} />

      {sprints.filter((s) => s.status !== "completed").map((s) => (
        <SprintCard key={s.id} sprint={s} tickets={group(s.id)} openSprints={open} plannedTargets={sprints.filter((x) => x.status === "planned" && x.id !== s.id).map((x) => ({ id: x.id, name: x.name }))} />
      ))}

      <SprintCard backlog tickets={group(null)} openSprints={open} plannedTargets={[]} />

      {completed.length > 0 && <h2 style={{ margin: "28px 0 12px" }}>Completed sprints</h2>}
      {completed.map((s) => (
        <SprintCard key={s.id} sprint={s} tickets={group(s.id)} openSprints={open} plannedTargets={[]} />
      ))}
    </div>
  );
}
