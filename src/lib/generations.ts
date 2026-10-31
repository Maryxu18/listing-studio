import { isUuid, sql } from "./db";
import { publicUrl } from "./storage";
import type { ListingOption, ProductInput } from "./types";

export type GenerationImage = { position: number; status: "pending" | "ready" | "failed"; url: string | null; prompt: string };

export type GenerationView = {
  id: string;
  status: "generating" | "ready" | "failed";
  error: string | null;
  input: ProductInput;
  photoUrls: string[];
  options: (ListingOption & { images: GenerationImage[] })[] | null;
  confirmedProductId: string | null;
};

export async function getGenerationView(id: string, userId: string): Promise<GenerationView | null> {
  if (!isUuid(id)) return null;
  const [gen] = await sql<
    { id: string; status: GenerationView["status"]; error: string | null; input: ProductInput; photo_paths: string[]; options: ListingOption[] | null; product_id: string | null }[]
  >`
    select g.id, g.status, g.error, g.input, g.photo_paths, g.options,
      (select p.id from products p where p.generation_id = g.id limit 1) as product_id
    from generations g
    where g.id = ${id} and g.user_id = ${userId}`;
  if (!gen) return null;

  const images = await sql<{ option_index: number; position: number; status: GenerationImage["status"]; storage_path: string | null; prompt: string }[]>`
    select option_index, position, status, storage_path, prompt
    from generated_images where generation_id = ${id}
    order by option_index, position`;

  return {
    id: gen.id,
    status: gen.status,
    error: gen.error,
    input: gen.input,
    photoUrls: gen.photo_paths.map(publicUrl),
    confirmedProductId: gen.product_id,
    options:
      gen.options?.map((option, i) => ({
        ...option,
        images: images
          .filter((img) => img.option_index === i)
          .map((img) => ({
            position: img.position,
            status: img.status,
            prompt: img.prompt,
            url: img.storage_path ? publicUrl(img.storage_path) : null,
          })),
      })) ?? null,
  };
}
