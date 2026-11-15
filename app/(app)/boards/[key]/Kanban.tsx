"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { updateTicket } from "@/lib/actions";
import { PRIORITIES, STATUSES, TYPES } from "@/lib/constants";
import type { Ticket, User } from "@/lib/types";
import { Avatar, PriorityIcon, ProgressBar, TypeIcon } from "@/components/ui";

export default function Kanban({ tickets, users, meId, showSprint }: { tickets: Ticket[]; users: User[]; meId: number; showSprint?: boolean }) {
  const [items, setItems] = useState(tickets);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const [assignee, setAssignee] = useState("");
  const [type, setType] = useState("");
  const [priority, setPriority] = useState("");

  // Re-sync with the server after actions revalidate.
  useEffect(() => setItems(tickets), [tickets]);

  const filtered = useMemo(
    () =>
      items.filter(
        (t) =>
          (!q || t.title.toLowerCase().includes(q.toLowerCase()) || t.key.toLowerCase().includes(q.toLowerCase())) &&
          (!assignee || (assignee === "me" ? t.assignee_id === meId : assignee === "none" ? t.assignee_id === null : String(t.assignee_id) === assignee)) &&
          (!type || t.type === type) &&
          (!priority || t.priority === priority),
      ),
    [items, q, assignee, type, priority, meId],
  );

  function move(id: number, status: string) {
    const t = items.find((x) => x.id === id);
    if (!t || t.status === status) return;
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, status, progress: status === "done" ? 100 : x.progress } : x)));
    startTransition(() => updateTicket(id, "status", status));
  }

  const active = q || assignee || type || priority;

  return (
    <>
      <div className="filters">
        <input placeholder="Search this board…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 220 }} />
        <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">Anyone assigned</option><option value="me">Assigned to me</option><option value="none">Unassigned</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)}><option value="">All priorities</option>{PRIORITIES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
        {active && <button className="btn ghost sm" onClick={() => { setQ(""); setAssignee(""); setType(""); setPriority(""); }}>Clear filters</button>}
      </div>
      <div className="kanban">
        {STATUSES.map((s) => {
          const col = filtered.filter((t) => t.status === s.id);
          return (
            <div
              key={s.id}
              className={"col" + (overCol === s.id ? " over" : "")}
              onDragOver={(e) => { e.preventDefault(); setOverCol(s.id); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol(null); }}
              onDrop={(e) => { e.preventDefault(); setOverCol(null); if (dragId) move(dragId, s.id); setDragId(null); }}
            >
              <div className="col-head"><i className="dot" style={{ background: s.color }} /><h3>{s.label}</h3><span className="count">{col.length}</span></div>
              {col.map((t) => (
                <Link
                  key={t.id}
                  href={`/browse/${t.key}`}
                  className={"tcard" + (dragId === t.id ? " dragging" : "")}
                  draggable
                  onDragStart={(e) => { setDragId(t.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(t.id)); }}
                  onDragEnd={() => { setDragId(null); setOverCol(null); }}
                  style={{ ["--stripe" as string]: PRIORITIES.find((p) => p.id === t.priority)?.color }}
                >
                  <div className="title">{t.title}</div>
                  {showSprint && <div style={{ marginBottom: 8 }}><span className="pill">{t.sprint_name ?? "Backlog"}</span></div>}
                  <div className="meta">
                    <TypeIcon type={t.type} /><span className="key">{t.key}</span>
                    <span className="chips">{t.attach_count > 0 && <span>📎 {t.attach_count}</span>}{t.comment_count > 0 && <span>💬 {t.comment_count}</span>}</span>
                    <span className="spacer" />
                    <PriorityIcon priority={t.priority} />
                    <Avatar name={t.assignee_name} color={t.assignee_color} size={24} />
                  </div>
                  {t.progress > 0 && t.status !== "done" && <ProgressBar value={t.progress} />}
                </Link>
              ))}
              {col.length === 0 && <div className="empty-col">{active ? "No matches" : "Drop tickets here"}</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}
