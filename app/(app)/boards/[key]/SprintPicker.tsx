"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";

type S = { id: number; name: string; status: string };

export default function SprintPicker({ boardKey, view, sprints }: { boardKey: string; view: string; sprints: S[] }) {
  const router = useRouter();
  const open = sprints.filter((s) => s.status !== "completed");
  const past = sprints.filter((s) => s.status === "completed");
  const href = (v: string) => `/boards/${boardKey}?sprint=${v}`;
  return (
    <div className="sprint-tabs">
      {open.map((s) => (
        <Link key={s.id} href={href(String(s.id))} className={"chip" + (view === String(s.id) ? " active" : "")}>
          {s.status === "active" ? "● " : ""}{s.name}
        </Link>
      ))}
      <Link href={href("backlog")} className={"chip" + (view === "backlog" ? " active" : "")}>Backlog</Link>
      <Link href={href("all")} className={"chip" + (view === "all" ? " active" : "")}>All tickets</Link>
      {past.length > 0 && (
        <select
          style={{ width: "auto", padding: "2px 8px", borderRadius: 16 }}
          value={past.some((s) => String(s.id) === view) ? view : ""}
          onChange={(e) => e.target.value && router.push(href(e.target.value))}
          aria-label="Completed sprints"
        >
          <option value="">Completed sprints…</option>
          {past.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}
    </div>
  );
}
