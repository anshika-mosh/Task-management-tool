import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getTicketByKey } from "@/lib/queries";

export async function GET(req: Request) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const t = getTicketByKey(new URL(req.url).searchParams.get("key") ?? "");
  if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ id: t.id });
}
