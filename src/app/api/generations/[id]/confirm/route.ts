import { isUuid, sql } from "@/lib/db";
import { getSession, unauthorized } from "@/lib/auth";
import { OPTION_COUNT, type ListingOption, type ProductInput } from "@/lib/types";

/** Saves the chosen recommendation set as a product in "My products". */
export async function POST(request: Request, ctx: RouteContext<"/api/generations/[id]/confirm">) {
  const session = await getSession();
  if (!session) return unauthorized();

  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Not found." }, { status: 404 });
  const { optionIndex } = await request.json().catch(() => ({}));
  if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= OPTION_COUNT) {
    return Response.json({ error: "Pick one of the recommendations." }, { status: 400 });
  }

  const [gen] = await sql<{ status: string; input: ProductInput; photo_paths: string[]; options: ListingOption[] | null }[]>`
    select status, input, photo_paths, options from generations
    where id = ${id} and user_id = ${session.userId}`;
  if (!gen) return Response.json({ error: "Not found." }, { status: 404 });
  if (gen.status !== "ready" || !gen.options) {
    return Response.json({ error: "Recommendations are still generating." }, { status: 409 });
  }

  const [existing] = await sql<{ id: string }[]>`select id from products where generation_id = ${id}`;
  if (existing) return Response.json({ productId: existing.id });

  const images = await sql<{ storage_path: string }[]>`
    select storage_path from generated_images
    where generation_id = ${id} and option_index = ${optionIndex} and status = 'ready'
    order by position`;
  if (images.length === 0) {
    return Response.json({ error: "This option has no images. Choose another option." }, { status: 409 });
  }

  const option = gen.options[optionIndex];
  const [product] = await sql<{ id: string }[]>`
    insert into products (user_id, generation_id, option_index, input, title, description, tags, image_paths, source_photo_paths)
    values (
      ${session.userId}, ${id}, ${optionIndex}, ${sql.json(gen.input)}, ${option.title}, ${option.description},
      ${option.tags}, ${images.map((i) => i.storage_path)}, ${gen.photo_paths}
    )
    returning id`;

  return Response.json({ productId: product.id });
}
