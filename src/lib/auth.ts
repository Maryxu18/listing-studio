import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession, verifySession, type Session } from "./session-token";

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

/** For pages: redirect to /login when signed out. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function startSession(session: Session) {
  const store = await cookies();
  store.set(SESSION_COOKIE, await signSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function endSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export function unauthorized() {
  return Response.json({ error: "Please log in." }, { status: 401 });
}
