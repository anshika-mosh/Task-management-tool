"use client";
import { useFormAction } from "@/lib/use-form-action";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { completeSprint, createSprint, deleteSprint, startSprint, updateTicket } from "@/lib/actions";
import type { Sprint } from "@/lib/types";
import { Avatar, PriorityIcon, ProgressBar, StatusLozenge, TypeIcon } from "@/components/ui";
import { useConfirm } from "@/components/ConfirmProvider";

type T = { id: number; key: string; title: string; type: string; status: string; priority: string; assignee_name: string | null; assignee_color: string | null; sprint_id: number | null };
type Opt = { id: number; name: string };

export function CreateSprint({ boardId, boardKey, nextNumber }: { boardId: number; boardKey: string; nextNumber: number }) {
  const { state, onSubmit, pending } = useFormAction(createSprint.bind(null, boardId));
  const ref = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (state?.ok) { ref.current?.reset(); setOpen(false); } }, [state]);
  if (!open) return <button className="btn primary" style={{ marginBottom: 16 }} onClick={() => setOpen(true)}>+ Create sprint</button>;
  return (
    <form onSubmit={onSubmit} ref={ref} className="card" style={{ marginBottom: 16 }}>
      <h2>New sprint</h2>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0 12px" }}>
        <div><label>Name *</label><input name="name" required defaultValue={`${boardKey} Sprint ${nextNumber}`} /></div>
        <div><label>Start date</label><input type="date" name="start" /></div>
        <div><label>End date</label><input type="date" name="end" /></div>
      </div>
      <label>Sprint goal</label>
      <input name="goal" placeholder="What should this sprint achieve?" />
      {state?.error && <p className="err">{state.error}</p>}
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn primary" disabled={pending}>Create sprint</button>
        <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

function MoveSelect({ ticket, options }: { ticket: T; options: Opt[] }) {
  const [pending, start] = useTransition();
  return (
    <select
      value={ticket.sprint_id ?? ""}
      disabled={pending}
      style={{ width: 150, padding: "2px 6px" }}
      aria-label={`Sprint for ${ticket.key}`}
      onChange={(e) => start(() => updateTicket(ticket.id, "sprint_id", e.target.value || null))}
    >
      <option value="">Backlog</option>
      {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  );
}

export function SprintCard({ sprint, tickets, openSprints, plannedTargets, backlog }: { sprint?: Sprint; tickets: T[]; openSprints: Opt[]; plannedTargets: Opt[]; backlog?: boolean }) {
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [moveTo, setMoveTo] = useState("");
  const confirm = useConfirm();
  const [completing, setCompleting] = useState(false);
  const readOnly = sprint?.status === "completed";
  const unfinished = tickets.filter((t) => t.status !== "done").length;
  const pct = sprint && sprint.total ? Math.round((sprint.done / sprint.total) * 100) : 0;
  const run = (fn: () => Promise<{ error?: string }>) => start(async () => setError((await fn()).error ?? ""));

  return (
    <div className="card sprint-card">
      <div className="sprint-head">
        <h2>{backlog ? "Backlog" : sprint!.name}</h2>
        {sprint && <span className="lozenge" style={{ ["--c" as string]: sprint.status === "active" ? "#2684ff" : sprint.status === "completed" ? "#36b37e" : "#8993a4" }}>{sprint.status}</span>}
        {sprint && <span className="muted small">{sprint.start_date ?? "no start"} → {sprint.end_date ?? "no end"}</span>}
        <span className="muted small">{tickets.length} ticket{tickets.length === 1 ? "" : "s"}</span>
        <span className="spacer" />
        {sprint?.status === "planned" && <button className="btn primary sm" disabled={pending} onClick={() => run(() => startSprint(sprint.id))}>Start sprint</button>}
        {sprint?.status === "active" && <button className="btn sm" onClick={() => setCompleting(!completing)}>Complete sprint</button>}
        {sprint && sprint.status !== "active" && (
          <button className="btn danger sm" disabled={pending} onClick={async () => { if (await confirm({ title: `Delete ${sprint.name}?`, message: "The sprint is removed and its tickets move back to the backlog.", confirmLabel: "Delete sprint", danger: true })) run(() => deleteSprint(sprint.id)); }}>Delete</button>
        )}
      </div>
      {sprint?.goal && <p className="muted small" style={{ margin: "0 0 8px" }}>🎯 {sprint.goal}</p>}
      {sprint && sprint.total > 0 && <div className="row small muted" style={{ marginBottom: 8 }}><div className="grow"><ProgressBar value={pct} /></div>{sprint.done}/{sprint.total} done</div>}
      {completing && sprint && (
        <div className="hint" style={{ marginBottom: 10 }}>
          {unfinished === 0 ? "All tickets are done. " : `${unfinished} unfinished ticket${unfinished === 1 ? "" : "s"} will move to: `}
          {unfinished > 0 && (
            <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} style={{ width: "auto", display: "inline-block", marginRight: 8 }}>
              <option value="">Backlog</option>
              {plannedTargets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
          <button className="btn primary sm" disabled={pending} onClick={() => run(() => completeSprint(sprint.id, moveTo ? Number(moveTo) : null))}>Complete</button>{" "}
          <button className="btn ghost sm" onClick={() => setCompleting(false)}>Cancel</button>
        </div>
      )}
      {error && <p className="err" style={{ marginBottom: 8 }}>{error}</p>}
      {tickets.length === 0 ? (
        <div className="muted small" style={{ padding: "8px 0" }}>{backlog ? "Backlog is empty." : "No tickets in this sprint yet — move some here from the backlog."}</div>
      ) : (
        <table>
          <tbody>
            {tickets.map((t) => (
              <tr key={t.id}>
                <td style={{ width: 28 }}><TypeIcon type={t.type} /></td>
                <td><Link href={`/browse/${t.key}`}><span className="key">{t.key}</span> {t.title}</Link></td>
                <td><PriorityIcon priority={t.priority} /></td>
                <td><StatusLozenge status={t.status} /></td>
                <td><Avatar name={t.assignee_name} color={t.assignee_color} /></td>
                <td style={{ width: 170 }}>{readOnly ? <span className="muted small">Completed</span> : <MoveSelect ticket={t} options={openSprints} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
