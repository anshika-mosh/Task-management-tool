import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatSize, fullDate, initials, parseDate, timeAgo } from "@/lib/format";
import { BOARD_COLORS, PRIORITIES, priorityOf, STATUSES, statusOf, TYPES, typeOf } from "@/lib/constants";

describe("parseDate", () => {
  it("treats SQLite-style timestamps as UTC", () => {
    expect(parseDate("2026-01-02 03:04:05").toISOString()).toBe("2026-01-02T03:04:05.000Z");
  });
  it("parses ISO strings as-is", () => {
    expect(parseDate("2026-01-02T03:04:05.000Z").getTime()).toBe(Date.UTC(2026, 0, 2, 3, 4, 5));
  });
});

describe("timeAgo", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z"));
  });
  afterEach(() => vi.useRealTimers());
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

  it.each([
    [5_000, "just now"],
    [90_000, "1m ago"],
    [59 * 60_000, "59m ago"],
    [3 * 3600_000, "3h ago"],
    [2 * 86400_000, "2d ago"],
  ])("%i ms ago -> %s", (ms, expected) => {
    expect(timeAgo(ago(ms))).toBe(expected);
  });

  it("falls back to a calendar date after a week", () => {
    expect(timeAgo(ago(30 * 86400_000))).toMatch(/May 16, 2026/);
  });
  it("never shows negative time for future timestamps", () => {
    expect(timeAgo(new Date(Date.now() + 60_000).toISOString())).toBe("just now");
  });
});

describe("fullDate / formatSize / initials", () => {
  it("fullDate renders date and time", () => {
    expect(fullDate("2026-03-04T10:30:00.000Z")).toMatch(/2026/);
  });
  it.each([
    [0, "0 B"],
    [1023, "1023 B"],
    [1024, "1.0 KB"],
    [1536, "1.5 KB"],
    [5 * 1024 ** 2, "5.0 MB"],
    [3 * 1024 ** 3, "3.00 GB"],
  ])("formatSize(%i) = %s", (n, s) => expect(formatSize(n)).toBe(s));

  it.each([
    ["Priya Sharma", "PS"],
    ["alex", "A"],
    ["  Mary  Jane  Watson ", "MJ"],
    ["", ""],
  ])("initials(%j) = %j", (n, i) => expect(initials(n)).toBe(i));
});

describe("constants", () => {
  it("has the four workflow statuses in board order", () => {
    expect(STATUSES.map((s) => s.id)).toEqual(["todo", "in_progress", "in_review", "done"]);
  });
  it("has five priorities from highest to lowest", () => {
    expect(PRIORITIES.map((p) => p.id)).toEqual(["highest", "high", "medium", "low", "lowest"]);
  });
  it("has the four ticket types", () => {
    expect(TYPES.map((t) => t.id)).toEqual(["task", "story", "bug", "epic"]);
  });
  it("lookups fall back to a sensible default for unknown ids", () => {
    expect(statusOf("nope").id).toBe("todo");
    expect(priorityOf("nope").id).toBe("medium");
    expect(typeOf("nope").id).toBe("task");
    expect(statusOf("done").label).toBe("Done");
  });
  it("board colours are valid hex values", () => {
    for (const c of BOARD_COLORS) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
