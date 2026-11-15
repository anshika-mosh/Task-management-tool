export function parseDate(s: string): Date {
  return new Date(s.includes("T") ? s : s.replace(" ", "T") + "Z");
}

export function timeAgo(s: string): string {
  const sec = Math.max(0, (Date.now() - parseDate(s).getTime()) / 1000);
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)}d ago`;
  return parseDate(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function fullDate(s: string): string {
  return parseDate(s).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
