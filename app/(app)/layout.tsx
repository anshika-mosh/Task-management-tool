import { requireUser } from "@/lib/auth";
import { getBoards, getUsers } from "@/lib/queries";
import Navbar from "@/components/Navbar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <>
      <Navbar user={user} boards={getBoards()} users={getUsers()} />
      <main>{children}</main>
    </>
  );
}
