import { isUuid, sql } from "@/lib/db";
import { getSession, unauthorized } from "@/lib/auth";
import { activateListing, EtsyError } from "@/lib/etsy";

/** Makes the Etsy draft live. Etsy charges its listing fee for this. */
export async function POST(_request: Request, ctx: RouteContext<"/api/products/[id]/activate">) {
  const session = await getSession();
  if (!session) return unauthorized();

  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Not found." }, { status: 404 });

  const [product] = await sql<{ etsy_status: string; etsy_shop_id: string | null; etsy_listing_id: string | null; etsy_url: string | null }[]>`
    select etsy_status, etsy_shop_id, etsy_listing_id, etsy_url from products where id = ${id} and user_id = ${session.userId}`;
  if (!product) return Response.json({ error: "Not found." }, { status: 404 });
  if (product.etsy_status === "active") return Response.json({ url: product.etsy_url });
  if (product.etsy_status !== "draft" || !product.etsy_shop_id || !product.etsy_listing_id) {
    return Response.json({ error: "Publish a draft to Etsy first." }, { status: 409 });
  }

  try {
    const listing = await activateListing(session.userId, product.etsy_shop_id, product.etsy_listing_id);
    await sql`update products set etsy_status = 'active', etsy_url = ${listing.url}, published_at = now() where id = ${id}`;
    return Response.json({ url: listing.url });
  } catch (err) {
    console.error(`Etsy activate failed for product ${id}:`, err);
    const status = err instanceof EtsyError ? err.status : 500;
    return Response.json({ error: err instanceof Error ? err.message : "Could not make the listing live." }, { status });
  }
}
