import bcrypt from "bcryptjs";
import { sql } from "@/lib/db";
import { startSession } from "@/lib/auth";

export async function POST(request: Request) {
  const { username, password } = await request.json().catch(() => ({}));
  const name = typeof username === "string" ? username.trim().toLowerCase() : "";

  if (!/^[a-z0-9_.-]{3,32}$/.test(name)) {
    return Response.json({ error: "Username must be 3-32 characters: letters, numbers, _ . -" }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < 8) {
    return Response.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const hash = await bcrypt.hash(password, 10);
  const [user] = await sql<{ id: string; username: string }[]>`
    insert into users (username, password_hash) values (${name}, ${hash})
    on conflict (username) do nothing
    returning id, username`;
  if (!user) return Response.json({ error: "That username is taken." }, { status: 409 });

  await startSession({ userId: user.id, username: user.username });
  return Response.json({ ok: true });
}
