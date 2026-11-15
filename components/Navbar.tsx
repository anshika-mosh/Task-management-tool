"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logout } from "@/lib/actions";
import type { Board, User } from "@/lib/types";
import { Avatar, BoardAvatar } from "./ui";
import CreateTicket from "./CreateTicket";
import ThemeToggle from "./ThemeToggle";
import type { SprintOpt } from "./CreateTicket";

function Dropdown({ label, children, right }: { label: React.ReactNode; children: React.ReactNode; right?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div className="menu" ref={ref}>
      <button className="menu-btn" onClick={() => setOpen(!open)}>{label}</button>
      {/* Close after choosing a link. Not for buttons: unmounting a form before the browser submits it would cancel the submit (e.g. Log out). */}
      {open && <div className={"menu-pop" + (right ? " right" : "")} onClick={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}>{children}</div>}
    </div>
  );
}

export default function Navbar({ user, boards, users, sprints, allowUploads }: { user: User; boards: Board[]; users: User[]; sprints: SprintOpt[]; allowUploads: boolean }) {
  const path = usePathname();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const current = boards.find((b) => path.startsWith(`/boards/${b.key}`) || path.startsWith(`/browse/${b.key}-`));
  return (
    <header className="nav">
      <Link href="/" className="brand"><span className="brand-mark">✓</span> TaskFlow</Link>
      <Link href="/" className={"link" + (path === "/" ? " active" : "")}>Home</Link>
      <Dropdown label="Boards ▾">
        {boards.length === 0 && <span className="muted small" style={{ padding: "8px 14px", display: "block" }}>No boards yet</span>}
        {boards.map((b) => (
          <Link key={b.id} href={`/boards/${b.key}`}><BoardAvatar boardKey={b.key} color={b.color} size={24} /> {b.name} <span className="muted small">({b.key})</span></Link>
        ))}
      </Dropdown>
      <Link href="/issues" className={"link" + (path.startsWith("/issues") ? " active" : "")}>All tickets</Link>
      {user.role === "admin" && <Link href="/admin" className={"link" + (path.startsWith("/admin") ? " active" : "")}>Admin</Link>}
      <button className="btn primary" style={{ marginLeft: 8 }} onClick={() => setCreating(true)} disabled={!boards.length} title={boards.length ? "" : "An admin needs to create a board first"}>
        + Create
      </button>
      <form className="grow" onSubmit={(e) => { e.preventDefault(); const q = new FormData(e.currentTarget).get("q"); router.push(`/issues?q=${encodeURIComponent(String(q ?? ""))}`); }}>
        <input name="q" className="search" placeholder="Search tickets (e.g. WEB-3 or keyword)" aria-label="Search tickets" />
      </form>
      <ThemeToggle />
      <Dropdown right label={<span className="row"><Avatar name={user.name} color={user.color} size={28} /></span>}>
        <div style={{ padding: "8px 14px" }}><b>{user.name}</b><br /><span className="muted small">{user.email} · {user.role}</span></div>
        <hr />
        <form action={logout}><button type="submit">Log out</button></form>
      </Dropdown>
      {creating && <CreateTicket boards={boards} users={users} sprints={sprints} allowUploads={allowUploads} defaultBoardId={current?.id} onClose={() => setCreating(false)} />}
    </header>
  );
}
