import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { completeAuthorization, EtsyError } from "@/lib/etsy";

const OAUTH_COOKIE = "etsy_oauth";

/** Etsy redirects here after the seller approves (or denies) access. */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", request.url));

  const params = request.nextUrl.searchParams;
  let saved: { state: string; verifier: string; next: string } | null = null;
  try {
    saved = JSON.parse(request.cookies.get(OAUTH_COOKIE)?.value ?? "null");
  } catch {}

  const back = new URL(saved?.next ?? "/products", request.url);
  const finish = (error?: string) => {
    if (error) back.searchParams.set("etsy_error", error);
    else back.searchParams.set("etsy", "connected");
    const res = NextResponse.redirect(back);
    res.cookies.delete({ name: OAUTH_COOKIE, path: "/api/etsy" });
    return res;
  };

  if (params.get("error")) return finish(params.get("error_description") ?? "Etsy access was denied.");
  const code = params.get("code");
  if (!saved || !code || params.get("state") !== saved.state) return finish("Etsy sign-in expired or was tampered with. Please try again.");

  try {
    await completeAuthorization(session.userId, code, saved.verifier);
  } catch (err) {
    console.error("Etsy OAuth callback failed:", err);
    return finish(err instanceof EtsyError ? err.message : "Could not connect your Etsy shop.");
  }
  return finish();
}
