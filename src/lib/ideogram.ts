// Ideogram 3.0 Remix: generates a new image guided by the seller's photo so the
// product stays recognisable. Docs: https://developer.ideogram.ai/api-reference/api-reference/remix-v3
const REMIX_URL = "https://api.ideogram.ai/v1/ideogram-v3/remix";

export async function remixProductImage(
  photo: { data: Buffer; mimeType: string },
  prompt: string,
  imageWeight: number,
): Promise<{ data: Buffer; contentType: string }> {
  const apiKey = process.env.IDEOGRAM_API_KEY;
  if (!apiKey) throw new Error("Missing IDEOGRAM_API_KEY.");

  for (let attempt = 0; ; attempt++) {
    const form = new FormData();
    form.append("image", new Blob([new Uint8Array(photo.data)], { type: photo.mimeType }), "product");
    form.append("prompt", prompt);
    form.append("image_weight", String(imageWeight));
    form.append("aspect_ratio", "1x1");
    form.append("rendering_speed", "TURBO");
    form.append("num_images", "1");

    const res = await fetch(REMIX_URL, { method: "POST", headers: { "Api-Key": apiKey }, body: form });
    if (res.status === 429 && attempt < 3) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Ideogram request failed (${res.status}): ${body.slice(0, 300)}`);
    }

    const json = (await res.json()) as { data?: { url?: string | null; is_image_safe?: boolean }[] };
    const image = json.data?.[0];
    if (!image?.url) throw new Error(image?.is_image_safe === false ? "Ideogram flagged the image as unsafe." : "Ideogram returned no image.");

    // Ideogram URLs expire, so download now and keep our own copy.
    const download = await fetch(image.url);
    if (!download.ok) throw new Error(`Downloading Ideogram image failed (${download.status}).`);
    return {
      data: Buffer.from(await download.arrayBuffer()),
      contentType: download.headers.get("content-type") || "image/png",
    };
  }
}
