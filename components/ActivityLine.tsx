import Link from "next/link";
import type { Activity } from "@/lib/types";
import { timeAgo, fullDate } from "@/lib/format";
import { Avatar } from "./ui";

export function describe(a: Activity): React.ReactNode {
  if (a.action === "created") return <>created this ticket</>;
  if (a.action === "added") return <>attached <b>{a.new_value}</b></>;
  if (a.action === "removed") return <>removed attachment <b>{a.old_value}</b></>;
  if (a.field === "Description" || a.field === "Summary" && !a.old_value) return <>updated the <b>{a.field?.toLowerCase()}</b></>;
  return (
    <>
      changed <b>{a.field}</b>
      {a.old_value ? <> from <span className="pill">{a.old_value}</span></> : null}
      {a.new_value ? <> to <span className="pill">{a.new_value}</span></> : <> (cleared)</>}
    </>
  );
}

export default function ActivityLine({ a, showTicket }: { a: Activity; showTicket?: boolean }) {
  return (
    <div className="activity-item">
      <Avatar name={a.user_name} color={a.user_color} size={28} />
      <div className="grow">
        <b>{a.user_name}</b> {describe(a)}
        {showTicket && (
          <> on <Link href={`/browse/${a.ticket_key}`}>{a.ticket_key}</Link> <span className="muted">{a.ticket_title}</span></>
        )}
        <div className="muted small" title={fullDate(a.created_at)}>{timeAgo(a.created_at)}</div>
      </div>
    </div>
  );
}
