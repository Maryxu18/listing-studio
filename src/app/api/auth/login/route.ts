import bcrypt from "bcryptjs";
import { sql } from "@/lib/db";
import { startSession } from "@/lib/auth";

export async function POST(request: Request) {
  const { username, password } = await request.json().catch(() => ({}));
  if (typeof username !== "string" || typeof password !== "string") {
    return Response.json({ error: "Username and password are required." }, { status: 400 });
  }

  const [user] = await sql<{ id: string; username: string; password_hash: string }[]>`
    select id, username, password_hash from users where username = ${username.trim().toLowerCase()}`;
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return Response.json({ error: "Wrong username or password." }, { status: 401 });
  }

  await startSession({ userId: user.id, username: user.username });
  return Response.json({ ok: true });
}
