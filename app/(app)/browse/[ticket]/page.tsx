import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { uploadsEnabled } from "@/lib/db";
import { getAttachments, getComments, getSprints, getTicketActivity, getTicketByKey, getUsers } from "@/lib/queries";
import { PRIORITIES, STATUSES, TYPES } from "@/lib/constants";
import { fullDate, timeAgo } from "@/lib/format";
import { Avatar, ProgressBar, TypeIcon } from "@/components/ui";
import ActivityLine from "@/components/ActivityLine";
import RichContent from "@/components/RichContent";
import { toSafeHtml } from "@/lib/rich";
import { AssignToMe, Attachments, CommentForm, DeleteComment, DeleteTicket, DescriptionEditor, FieldSelect, ProgressForm, Tabs, TitleEditor } from "./TicketClient";

export default async function TicketPage({ params }: { params: Promise<{ ticket: string }> }) {
  const me = await requireUser();
  const { ticket: key } = await params;
  const t = await getTicketByKey(key);
  if (!t) notFound();
  const users = await getUsers();
  const sprints = (await getSprints(t.board_id)).filter((s) => s.status !== "completed" || s.id === t.sprint_id);
  const comments = await getComments(t.id);
  const attachments = await getAttachments(t.id);
  const activity = await getTicketActivity(t.id);
  const updates = comments.filter((c) => c.kind === "progress");
  const canDelete = me.role === "admin" || t.reporter_id === me.id;

  const feed = (list: typeof comments, empty: string) =>
    list.length === 0 ? <p className="muted">{empty}</p> : list.map((c) => (
      <div className="feed-item" key={c.id}>
        <Avatar name={c.user_name} color={c.user_color} size={32} />
        <div className="feed-body">
          <div><span className="who">{c.user_name}</span> <span className="muted small" title={fullDate(c.created_at)}>
            {c.kind === "progress" ? "posted a progress update" : "commented"} · {timeAgo(c.created_at)}</span></div>
          {c.kind === "progress" ? (
            <div className="progress-note">
              <RichContent html={toSafeHtml(c.body)} />
              {(c.progress != null || c.hours != null) && (
                <div style={{ marginTop: 6 }}>
                  {c.progress != null && <span className="pill">📈 {c.progress}% complete</span>}
                  {c.hours != null && <span className="pill">⏱ {c.hours}h logged</span>}
                </div>
              )}
            </div>
          ) : <RichContent html={toSafeHtml(c.body)} />}
          {(c.user_id === me.id || me.role === "admin") && <DeleteComment id={c.id} />}
        </div>
      </div>
    ));

  return (
    <div className="page">
      <div className="crumbs"><Link href="/">Home</Link> / <Link href={`/boards/${t.board_key}`}>{t.board_name}</Link> / {t.key}</div>
      <div className="ticket-grid">
        <div>
          <div className="row" style={{ marginBottom: 4 }}><TypeIcon type={t.type} /><span className="key">{t.key}</span></div>
          <TitleEditor id={t.id} value={t.title} />
          <div className="assigned-strip">
            <span className="muted small"><b>Assigned to</b></span>
            <Avatar name={t.assignee_name} color={t.assignee_color} size={24} />
            <span>{t.assignee_name ?? <span className="muted">Unassigned</span>}</span>
            {t.assignee_id !== me.id && <AssignToMe id={t.id} meId={me.id} />}
            {t.sprint_name && <span className="pill">🏃 {t.sprint_name}</span>}
          </div>

          <div className="section"><h3>Description</h3><DescriptionEditor id={t.id} html={toSafeHtml(t.description)} /></div>

          {(attachments.length > 0 || uploadsEnabled()) && (
            <div className="section"><h3>Attachments ({attachments.length})</h3>
              <Attachments ticketId={t.id} items={attachments} meId={me.id} isAdmin={me.role === "admin"} allowUploads={uploadsEnabled()} />
            </div>
          )}

          <div className="section"><h3>Post a progress update</h3><ProgressForm ticketId={t.id} current={t.progress} /></div>

          <div className="section">
            <h3 style={{ marginBottom: 8 }}>Activity</h3>
            <Tabs
              tabs={[
                { id: "all", label: `Updates & comments (${comments.length})`, content: <><CommentForm ticketId={t.id} /><div style={{ height: 20 }} />{feed(comments, "No comments or updates yet.")}</> },
                { id: "progress", label: `Progress (${updates.length})`, content: feed(updates, "No progress updates yet.") },
                { id: "history", label: `History (${activity.length})`, content: <div>{activity.map((a) => <ActivityLine key={a.id} a={a} />)}</div> },
              ]}
            />
          </div>
        </div>

        <aside>
          <div className="details">
            <div className="details-head"><b>Details</b>{canDelete && <DeleteTicket id={t.id} ticketKey={t.key} />}</div>
            <div className="detail-row"><span className="lbl">Status</span><FieldSelect id={t.id} field="status" value={t.status} options={STATUSES.map((s) => ({ id: s.id, label: s.label }))} /></div>
            <div className="detail-row"><span className="lbl">Assigned to</span><FieldSelect id={t.id} field="assignee_id" value={t.assignee_id ?? ""} options={[{ id: "", label: "Unassigned" }, ...users.map((u) => ({ id: u.id, label: u.name }))]} /></div>
            <div className="detail-row"><span className="lbl">Sprint</span><FieldSelect id={t.id} field="sprint_id" value={t.sprint_id ?? ""} options={[{ id: "", label: "Backlog (no sprint)" }, ...sprints.map((s) => ({ id: s.id, label: s.name + (s.status === "active" ? " (active)" : s.status === "completed" ? " (completed)" : "") }))]} /></div>
            <div className="detail-row"><span className="lbl">Priority</span><FieldSelect id={t.id} field="priority" value={t.priority} options={PRIORITIES.map((s) => ({ id: s.id, label: s.label }))} /></div>
            <div className="detail-row"><span className="lbl">Type</span><FieldSelect id={t.id} field="type" value={t.type} options={TYPES.map((s) => ({ id: s.id, label: s.label }))} /></div>
            <div className="detail-row"><span className="lbl">Due date</span><FieldSelect id={t.id} field="due_date" type="date" value={t.due_date} /></div>
            <div className="detail-row"><span className="lbl">Progress</span><div className="row"><div className="grow"><ProgressBar value={t.progress} /></div><b>{t.progress}%</b></div></div>
            <div className="detail-row"><span className="lbl">Time logged</span><span>{t.hours ? `${t.hours}h` : "—"}</span></div>
            <div className="detail-row"><span className="lbl">Reporter</span><span className="row"><Avatar name={t.reporter_name} color={t.reporter_color} />{t.reporter_name ?? "—"}</span></div>
          </div>
          <p className="muted small" style={{ marginTop: 12 }}>
            Created {fullDate(t.created_at)}<br />Updated {timeAgo(t.updated_at)}
          </p>
        </aside>
      </div>
    </div>
  );
}
