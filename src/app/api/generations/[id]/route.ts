import { getSession, unauthorized } from "@/lib/auth";
import { getGenerationView } from "@/lib/generations";

export async function GET(_request: Request, ctx: RouteContext<"/api/generations/[id]">) {
  const session = await getSession();
  if (!session) return unauthorized();

  const { id } = await ctx.params;
  const view = await getGenerationView(id, session.userId);
  if (!view) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json(view);
}
