import { sql } from "./db";
import { generateSeoOptions, planImagePrompts } from "./gemini";
import { remixProductImage } from "./ideogram";
import { uploadImage } from "./storage";
import { GIFT_OPTION_INDEX, type ProductInput, type SeoListing } from "./types";

type Photo = { data: Buffer; mimeType: string };

const IDEOGRAM_CONCURRENCY = 4;
// Hero stays close to the seller's photo; later shots need room to change scene and angle.
const HERO_IMAGE_WEIGHT = 70;
const FOLLOWUP_IMAGE_WEIGHT = 45;
// The lifestyle shot (image 2) adds a person using the product, so it needs the most freedom.
const LIFESTYLE_IMAGE_WEIGHT = 30;

/** Detects png/jpeg/webp from magic bytes; the storage bucket only accepts these. */
export function sniffImageType(data: Buffer): "image/png" | "image/jpeg" | "image/webp" | null {
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as const;

/** Caps concurrent Ideogram calls across all options of a generation. */
function limiter(max: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active >= max) await new Promise<void>((resolve) => queue.push(resolve));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}

/**
 * Runs after the generate request has responded. Writes the 3 SEO options as
 * soon as Gemini returns, then each option independently gets an art-directed
 * shot list and its images, so the UI can poll and fill in progressively.
 */
export async function runGeneration(generationId: string, input: ProductInput, photos: Photo[]) {
  try {
    const options = await generateSeoOptions(input, photos);
    await sql`update generations set options = ${sql.json(options)} where id = ${generationId}`;

    const limit = limiter(IDEOGRAM_CONCURRENCY);
    await Promise.all(options.map((listing, i) => runOption(generationId, i, listing, photos, limit)));

    await sql`update generations set status = 'ready' where id = ${generationId}`;
  } catch (err) {
    console.error(`Generation ${generationId} failed:`, err);
    await sql`update generations set status = 'failed', error = ${message(err)} where id = ${generationId}`;
  }
}

async function runOption(
  generationId: string,
  optionIndex: number,
  listing: SeoListing,
  photos: Photo[],
  limit: ReturnType<typeof limiter>,
) {
  let prompts: string[];
  try {
    prompts = await planImagePrompts(listing, photos, optionIndex === GIFT_OPTION_INDEX);
  } catch (err) {
    console.error(`Art direction failed for ${generationId} option ${optionIndex}:`, err);
    return;
  }

  await sql`
    update generations
    set options = jsonb_set(options, ${[String(optionIndex), "image_prompts"]}, ${sql.json(prompts)})
    where id = ${generationId}`;
  await sql`
    insert into generated_images ${sql(
      prompts.map((prompt, position) => ({ generation_id: generationId, option_index: optionIndex, position, prompt })),
    )}`;

  const render = (position: number, reference: Photo, weight: number) =>
    limit(async () => {
      try {
        const image = await remixProductImage(reference, prompts[position], weight);
        const type = sniffImageType(image.data) ?? "image/png";
        const path = await uploadImage(`generated/${generationId}/${optionIndex}-${position}.${EXT[type]}`, image.data, type);
        await sql`
          update generated_images set status = 'ready', storage_path = ${path}
          where generation_id = ${generationId} and option_index = ${optionIndex} and position = ${position}`;
        return { data: image.data, mimeType: type } satisfies Photo;
      } catch (err) {
        console.error(`Image ${optionIndex}-${position} failed for ${generationId}:`, err);
        await sql`
          update generated_images set status = 'failed', error = ${message(err)}
          where generation_id = ${generationId} and option_index = ${optionIndex} and position = ${position}`;
        return null;
      }
    });

  // Image 1 (hero) is the master product reference for images 2-5. If it fails,
  // fall back to the seller's own photo so the rest still show the real product.
  const hero = await render(0, photos[0], HERO_IMAGE_WEIGHT);
  const reference = hero ?? photos[0];
  await Promise.all(
    prompts.slice(1).map((_, i) => render(i + 1, reference, i + 1 === 1 ? LIFESTYLE_IMAGE_WEIGHT : FOLLOWUP_IMAGE_WEIGHT)),
  );
}

function message(err: unknown) {
  return (err instanceof Error ? err.message : String(err)).slice(0, 500);
}
