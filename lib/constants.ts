export const STATUSES = [
  { id: "todo", label: "To Do", color: "#8993a4" },
  { id: "in_progress", label: "In Progress", color: "#2684ff" },
  { id: "in_review", label: "In Review", color: "#8777d9" },
  { id: "done", label: "Done", color: "#36b37e" },
] as const;

export const PRIORITIES = [
  { id: "highest", label: "Highest", glyph: "⇈", color: "#de350b" },
  { id: "high", label: "High", glyph: "↑", color: "#ff5630" },
  { id: "medium", label: "Medium", glyph: "=", color: "#ff991f" },
  { id: "low", label: "Low", glyph: "↓", color: "#2684ff" },
  { id: "lowest", label: "Lowest", glyph: "⇊", color: "#4c9aff" },
] as const;

export const TYPES = [
  { id: "task", label: "Task", glyph: "✓", color: "#4bade8" },
  { id: "story", label: "Story", glyph: "▮", color: "#63ba3c" },
  { id: "bug", label: "Bug", glyph: "●", color: "#e5493a" },
  { id: "epic", label: "Epic", glyph: "⚡", color: "#904ee2" },
] as const;

export const BOARD_COLORS = ["#2684ff", "#36b37e", "#ff5630", "#8777d9", "#ff991f", "#00b8d9", "#e5493a", "#6554c0"];

export const MAX_UPLOAD_MB = 300;

export const statusOf = (id: string) => STATUSES.find((s) => s.id === id) ?? STATUSES[0];
export const priorityOf = (id: string) => PRIORITIES.find((s) => s.id === id) ?? PRIORITIES[2];
export const typeOf = (id: string) => TYPES.find((s) => s.id === id) ?? TYPES[0];
