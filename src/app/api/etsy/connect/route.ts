import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { EtsyError, startAuthorization } from "@/lib/etsy";

const OAUTH_COOKIE = "etsy_oauth";

/** Starts Etsy OAuth. ?next=/products/… is where to return afterwards. */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", request.url));

  const next = request.nextUrl.searchParams.get("next");
  const returnTo = next?.startsWith("/") ? next : "/products";

  let auth;
  try {
    auth = startAuthorization();
  } catch (err) {
    const url = new URL(returnTo, request.url);
    url.searchParams.set("etsy_error", err instanceof EtsyError ? err.message : "Could not start Etsy sign-in.");
    return NextResponse.redirect(url);
  }

  const res = NextResponse.redirect(auth.url);
  res.cookies.set(OAUTH_COOKIE, JSON.stringify({ state: auth.state, verifier: auth.verifier, next: returnTo }), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/etsy",
    maxAge: 600,
  });
  return res;
}
