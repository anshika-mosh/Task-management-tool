import { requireUser } from "@/lib/auth";
import { getBoards, getOpenSprints, getUsers } from "@/lib/queries";
import Navbar from "@/components/Navbar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <>
      <Navbar user={user} boards={getBoards()} users={getUsers()} sprints={getOpenSprints().map((s) => ({ id: s.id, board_id: s.board_id, name: s.name, status: s.status }))} />
      <main>{children}</main>
    </>
  );
}
