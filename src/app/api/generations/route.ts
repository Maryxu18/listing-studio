import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { sql } from "@/lib/db";
import { getSession, unauthorized } from "@/lib/auth";
import { runGeneration, sniffImageType } from "@/lib/pipeline";
import { uploadImage } from "@/lib/storage";
import type { ProductInput } from "@/lib/types";

export const maxDuration = 300;

const MAX_PHOTOS = 4;
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  const form = await request.formData();
  const field = (name: string) => {
    const v = form.get(name);
    return typeof v === "string" ? v.trim() : "";
  };

  const input: ProductInput = {
    name: field("name"),
    category: field("category"),
    details: field("details"),
    materials: field("materials") || undefined,
    price: field("price") || undefined,
    keywords: field("keywords") || undefined,
    audience: field("audience") || undefined,
  };
  if (!input.name || !input.category || !input.details) {
    return Response.json({ error: "Product name, category and details are required." }, { status: 400 });
  }

  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return Response.json({ error: "Add at least one product photo." }, { status: 400 });
  if (files.length > MAX_PHOTOS) return Response.json({ error: `Up to ${MAX_PHOTOS} photos.` }, { status: 400 });

  const photos: { data: Buffer; mimeType: string }[] = [];
  for (const file of files) {
    if (file.size > MAX_PHOTO_BYTES) return Response.json({ error: `${file.name} is larger than 4 MB.` }, { status: 400 });
    const data = Buffer.from(await file.arrayBuffer());
    const mimeType = sniffImageType(data);
    if (!mimeType) return Response.json({ error: `${file.name} must be a JPEG, PNG or WebP image.` }, { status: 400 });
    photos.push({ data, mimeType });
  }

  const id = randomUUID();
  const photoPaths = await Promise.all(
    photos.map((p, i) => uploadImage(`uploads/${session.userId}/${id}/${i}.${p.mimeType.split("/")[1]}`, p.data, p.mimeType)),
  );

  await sql`
    insert into generations (id, user_id, input, photo_paths)
    values (${id}, ${session.userId}, ${sql.json(input)}, ${photoPaths})`;

  after(() => runGeneration(id, input, photos));
  return Response.json({ id });
}
