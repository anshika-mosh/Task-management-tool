import { initials } from "@/lib/format";
import { priorityOf, statusOf, typeOf } from "@/lib/constants";

export function Avatar({ name, color, size = 24 }: { name?: string | null; color?: string | null; size?: number }) {
  if (!name) return <span className="avatar empty" style={{ width: size, height: size }} title="Unassigned">?</span>;
  return (
    <span className="avatar" title={name} style={{ width: size, height: size, background: color ?? "#6b778c", fontSize: size * 0.42 }}>
      {initials(name)}
    </span>
  );
}

export function TypeIcon({ type }: { type: string }) {
  const t = typeOf(type);
  return <span className="type-icon" title={t.label} style={{ background: t.color }}>{t.glyph}</span>;
}

export function PriorityIcon({ priority, label }: { priority: string; label?: boolean }) {
  const p = priorityOf(priority);
  return (
    <span className="prio" title={p.label} style={{ color: p.color }}>
      <b>{p.glyph}</b>{label && <span>{p.label}</span>}
    </span>
  );
}

export function StatusLozenge({ status }: { status: string }) {
  const s = statusOf(status);
  return <span className="lozenge" style={{ ["--c" as string]: s.color }}>{s.label}</span>;
}

export function ProgressBar({ value, color }: { value: number; color?: string }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div style={{ width: `${value}%`, background: color }} />
    </div>
  );
}

export function BoardAvatar({ boardKey, color, size = 32 }: { boardKey: string; color: string; size?: number }) {
  return <span className="board-avatar" style={{ background: color, width: size, height: size, fontSize: size * 0.34 }}>{boardKey.slice(0, 3)}</span>;
}
