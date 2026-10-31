import { isUuid, sql } from "@/lib/db";
import { getSession, unauthorized } from "@/lib/auth";
import { createDraft, EtsyError, WHEN_MADE, WHO_MADE } from "@/lib/etsy";
import { downloadImage } from "@/lib/storage";
import type { ProductInput } from "@/lib/types";

export const maxDuration = 120;

/** Creates a free draft listing in the seller's Etsy shop with the product's copy and images. */
export async function POST(request: Request, ctx: RouteContext<"/api/products/[id]/publish">) {
  const session = await getSession();
  if (!session) return unauthorized();

  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Not found." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const price = Number(body.price);
  const quantity = Number(body.quantity);
  if (!(price > 0)) return Response.json({ error: "Enter a price greater than 0." }, { status: 400 });
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
    return Response.json({ error: "Quantity must be a whole number from 1 to 999." }, { status: 400 });
  }
  if (!WHO_MADE.includes(body.whoMade) || !WHEN_MADE.includes(body.whenMade)) {
    return Response.json({ error: "Choose who made it and when." }, { status: 400 });
  }

  const [product] = await sql<
    { title: string; description: string; tags: string[]; image_paths: string[]; input: ProductInput; etsy_status: string; etsy_url: string | null }[]
  >`
    select title, description, tags, image_paths, input, etsy_status, etsy_url
    from products where id = ${id} and user_id = ${session.userId}`;
  if (!product) return Response.json({ error: "Not found." }, { status: 404 });
  if (product.etsy_status !== "not_published") return Response.json({ url: product.etsy_url });

  try {
    const images = await Promise.all(product.image_paths.map(downloadImage));
    const draft = await createDraft(session.userId, {
      title: product.title,
      description: product.description,
      tags: product.tags,
      price,
      quantity,
      whoMade: body.whoMade,
      whenMade: body.whenMade,
      materials: product.input.materials,
      input: product.input,
      images,
    });
    await sql`
      update products
      set etsy_status = 'draft', etsy_shop_id = ${draft.shopId}, etsy_listing_id = ${draft.listingId},
          etsy_url = ${draft.editUrl}, published_at = now()
      where id = ${id}`;
    return Response.json({ url: draft.editUrl });
  } catch (err) {
    console.error(`Etsy publish failed for product ${id}:`, err);
    const status = err instanceof EtsyError ? err.status : 500;
    return Response.json({ error: err instanceof Error ? err.message : "Publishing to Etsy failed." }, { status });
  }
}
