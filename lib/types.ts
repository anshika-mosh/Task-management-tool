export type User = { id: number; name: string; email: string; role: "admin" | "member"; color: string; created_at: string };
export type Board = { id: number; key: string; name: string; description: string; color: string; counter: number; created_at: string };
export type BoardStats = Board & { total: number; todo: number; in_progress: number; in_review: number; done: number; avg_progress: number };
export type Ticket = {
  id: number; board_id: number; number: number; key: string; board_key: string; board_name: string; board_color: string;
  title: string; description: string; type: string; status: string; priority: string;
  assignee_id: number | null; assignee_name: string | null; assignee_color: string | null;
  reporter_id: number | null; reporter_name: string | null; reporter_color: string | null;
  progress: number; due_date: string | null; created_at: string; updated_at: string;
  attach_count: number; comment_count: number; hours: number;
};
export type Comment = { id: number; ticket_id: number; user_id: number; user_name: string; user_color: string; body: string; kind: "comment" | "progress"; progress: number | null; hours: number | null; created_at: string };
export type Attachment = { id: number; ticket_id: number; user_id: number; user_name: string; filename: string; mime: string; size: number; created_at: string };
export type Activity = { id: number; ticket_id: number; user_id: number; user_name: string; user_color: string; action: string; field: string | null; old_value: string | null; new_value: string | null; created_at: string; ticket_key?: string; ticket_title?: string };
