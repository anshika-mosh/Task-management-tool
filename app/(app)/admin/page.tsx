import { requireAdmin } from "@/lib/auth";
import { getBoardStats, getUsers } from "@/lib/queries";
import { BoardForms, UserForms, UserRow } from "./AdminClient";

export default async function Admin() {
  const me = await requireAdmin();
  const boards = getBoardStats();
  const users = getUsers();
  return (
    <div className="page">
      <div className="page-head"><div><h1>Administration</h1><div className="muted">Decide board names and keys, and manage who has access.</div></div></div>
      <BoardForms boards={boards} />
      <h2 style={{ margin: "32px 0 12px" }}>Users</h2>
      <UserForms />
      <div className="card" style={{ padding: 0, marginTop: 16 }}>
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th /></tr></thead>
          <tbody>{users.map((u) => <UserRow key={u.id} user={u} isMe={u.id === me.id} />)}</tbody>
        </table>
      </div>
    </div>
  );
}
