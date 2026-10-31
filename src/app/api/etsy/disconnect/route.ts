import { getSession, unauthorized } from "@/lib/auth";
import { disconnect } from "@/lib/etsy";

export async function POST() {
  const session = await getSession();
  if (!session) return unauthorized();
  await disconnect(session.userId);
  return Response.json({ ok: true });
}
