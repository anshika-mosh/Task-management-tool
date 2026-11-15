import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getBoardByKey, getTickets, getUsers } from "@/lib/queries";
import { BoardAvatar } from "@/components/ui";
import Kanban from "./Kanban";

export default async function BoardPage({ params }: { params: Promise<{ key: string }> }) {
  const me = await requireUser();
  const { key } = await params;
  const board = getBoardByKey(key);
  if (!board) notFound();
  const tickets = getTickets({ boardId: board.id });
  const users = getUsers();
  const done = tickets.filter((t) => t.status === "done").length;

  return (
    <div className="page" style={{ maxWidth: "none" }}>
      <div className="page-head">
        <BoardAvatar boardKey={board.key} color={board.color} size={44} />
        <div className="grow">
          <div className="crumbs">Boards / {board.name}</div>
          <h1>{board.name} <span className="key" style={{ fontSize: 14 }}>{board.key}</span></h1>
        </div>
        <div className="muted">{done}/{tickets.length} done</div>
      </div>
      <Kanban tickets={tickets} users={users} meId={me.id} />
    </div>
  );
}
