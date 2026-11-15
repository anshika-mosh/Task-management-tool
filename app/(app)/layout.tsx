import { requireUser } from "@/lib/auth";
import { getBoards, getOpenSprints, getUsers } from "@/lib/queries";
import Navbar from "@/components/Navbar";
import { ConfirmProvider } from "@/components/ConfirmProvider";
import { uploadsEnabled } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <>
      <Navbar user={user} boards={await getBoards()} users={await getUsers()} allowUploads={uploadsEnabled()} sprints={(await getOpenSprints()).map((s) => ({ id: s.id, board_id: s.board_id, name: s.name, status: s.status }))} />
      <ConfirmProvider>
        <main>{children}</main>
      </ConfirmProvider>
    </>
  );
}
