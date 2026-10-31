import { SignJWT, jwtVerify } from "jose";

// Kept free of DB imports so proxy.ts can use it.
export const SESSION_COOKIE = "session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export type Session = { userId: string; username: string };

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("Missing SESSION_SECRET. Run `stripe projects env --pull`.");
  return new TextEncoder().encode(s);
}

export async function signSession(session: Session) {
  return new SignJWT({ username: session.username })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub || typeof payload.username !== "string") return null;
    return { userId: payload.sub, username: payload.username };
  } catch {
    return null;
  }
}
