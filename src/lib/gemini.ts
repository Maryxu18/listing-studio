import { IMAGE_DIRECTOR_OUTPUT_CONTRACT, IMAGE_DIRECTOR_PROMPT } from "@/prompts/image-director";
import { GIFT_ANGLE, GIFT_OPTION_INDEX, IMAGES_PER_OPTION, OPTION_COUNT, TAG_COUNT, type ProductInput, type SeoListing } from "./types";

// Lite models answer in ~3-6s; the full Flash models took minutes and often
// returned 503 (overloaded) on the free tier. Tried in order on 429/5xx/timeout.
const MODELS = (process.env.GEMINI_MODEL || "gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-flash-lite-latest")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
const ATTEMPT_TIMEOUT_MS = 45_000;
const ROUNDS = 2;

type Photo = { data: Buffer; mimeType: string };

class RetryableError extends Error {}

export async function callGemini<T>({ system, text, photos, schema }: { system?: string; text: string; photos: Photo[]; schema: object }): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY.");

  const body = JSON.stringify({
    ...(system && { systemInstruction: { parts: [{ text: system }] } }),
    contents: [
      {
        role: "user",
        parts: [...photos.map((p) => ({ inline_data: { mime_type: p.mimeType, data: p.data.toString("base64") } })), { text }],
      },
    ],
    generationConfig: { responseMimeType: "application/json", responseSchema: schema, thinkingConfig: { thinkingLevel: "low" } },
  });

  let lastError: unknown;
  for (let round = 0; round < ROUNDS; round++) {
    if (round > 0) await new Promise((r) => setTimeout(r, 2000));
    for (const model of MODELS) {
      try {
        return await attempt<T>(model, apiKey, body);
      } catch (err) {
        if (!(err instanceof RetryableError)) throw err;
        console.warn(`Gemini ${model} unavailable, trying next: ${err.message}`);
        lastError = err;
      }
    }
  }
  throw new Error(`Gemini is overloaded right now, please try again in a minute. (${(lastError as Error).message})`);
}

async function attempt<T>(model: string, apiKey: string, body: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body,
      signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
    });
  } catch (err) {
    throw new RetryableError(`${model}: ${(err as Error).name === "TimeoutError" ? "timed out" : (err as Error).message}`);
  }

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    if (res.status === 429 || res.status >= 500) throw new RetryableError(`${model} ${res.status}`);
    throw new Error(`Gemini request failed (${res.status}): ${detail}`);
  }
  const json = await res.json();
  const out: string | undefined = json.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
  if (!out) throw new RetryableError(`${model} returned no content (${json.candidates?.[0]?.finishReason ?? "unknown reason"})`);
  try {
    return JSON.parse(out) as T;
  } catch {
    throw new RetryableError(`${model} returned malformed JSON`);
  }
}

const STRING = { type: "STRING" };
const STRINGS = { type: "ARRAY", items: STRING };

// ---------------------------------------------------------------------------
// Step 1: SEO copy (3 options)
// ---------------------------------------------------------------------------

const seoFields = [
  "angle",
  "title",
  "description",
  "tags",
  "primary_keyword",
  "secondary_keywords",
  "target_audience",
  "search_intent",
  "product_positioning",
  "assumptions",
];

const seoSchema = {
  type: "OBJECT",
  properties: {
    options: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          angle: { ...STRING, description: "2-4 word name for this listing strategy" },
          title: STRING,
          description: STRING,
          tags: STRINGS,
          primary_keyword: STRING,
          secondary_keywords: STRINGS,
          target_audience: STRING,
          search_intent: STRING,
          product_positioning: STRING,
          assumptions: STRINGS,
        },
        required: seoFields,
        propertyOrdering: seoFields,
      },
    },
  },
  required: ["options"],
};

function seoPrompt(input: ProductInput) {
  const lines = [
    `Product name: ${input.name}`,
    `Category: ${input.category}`,
    `Details: ${input.details}`,
    input.materials && `Materials: ${input.materials}`,
    input.price && `Price: ${input.price}`,
    input.keywords && `Seller keywords / metadata: ${input.keywords}`,
    input.audience ? `Intended audience: ${input.audience}` : `Intended audience: not given; infer the most likely buyers.`,
  ].filter(Boolean);

  return `You are an expert Etsy SEO copywriter.
The attached photo(s) show the seller's actual product. Product information:
${lines.join("\n")}

Write exactly ${OPTION_COUNT} DIFFERENT listing recommendations, each taking a distinct strategy so the seller has a real choice.
Recommendation ${GIFT_OPTION_INDEX + 1} MUST be gift focused: positioned as a gift, covering occasions, recipients and the joy of giving it, with gift-related search phrases.
Choose the strategies for the other recommendations yourself, whatever best suits this product and audience (for example search-keyword focused, lifestyle/story, premium/artisan, practical/everyday). They must differ from each other and from the gift recommendation.

For each recommendation:
- angle: a short name for the strategy (2-4 words).
- title: max 140 characters. Front-load the most-searched keywords buyers would type. Natural phrasing, no keyword stuffing, no ALL CAPS, no emoji.
- description: 150-300 words in plain text. The first 1-2 sentences must hook the buyer and repeat the key search phrases (search engines show this snippet). Then cover features, materials, sizing/dimensions if known, use cases, and who it is for. Use short paragraphs and "- " bullet lines. Do not invent certifications, awards or specs that were not given.
- tags: exactly ${TAG_COUNT} unique multi-word search phrases buyers actually type, each at most 20 characters, lowercase, no "#". Cover synonyms, occasions, styles and audience.
- primary_keyword: the single search phrase this listing is built around.
- secondary_keywords: 3-6 supporting search phrases.
- target_audience: who this version of the listing is written for.
- search_intent: what the buyer searching these terms is trying to do (e.g. find a gift, replace an item, decorate a space).
- product_positioning: one or two sentences on how the listing positions the product (price/quality tier, style, differentiation).
- assumptions: anything you assumed that the seller did not state (e.g. dimensions read from the photo). Empty list if none.`;
}

export async function generateSeoOptions(input: ProductInput, photos: Photo[]): Promise<SeoListing[]> {
  const { options } = await callGemini<{ options: SeoListing[] }>({ text: seoPrompt(input), photos, schema: seoSchema });
  if (options.length < OPTION_COUNT) throw new Error(`Gemini returned ${options.length} options, expected ${OPTION_COUNT}.`);
  return options.slice(0, OPTION_COUNT).map((o, i) => ({
    ...o,
    angle: i === GIFT_OPTION_INDEX ? GIFT_ANGLE : o.angle.trim(),
    title: o.title.trim().slice(0, 140),
    description: o.description.trim(),
    tags: [...new Set(o.tags.map((t) => t.toLowerCase().replace(/^#/, "").trim().slice(0, 20)).filter(Boolean))].slice(0, TAG_COUNT),
  }));
}

// ---------------------------------------------------------------------------
// Step 2: art director plans 5 Ideogram prompts for one option
// ---------------------------------------------------------------------------

const planSchema = {
  type: "OBJECT",
  properties: {
    product_category: STRING,
    visual_strategy: STRING,
    images: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { purpose: STRING, prompt: STRING },
        required: ["purpose", "prompt"],
        propertyOrdering: ["purpose", "prompt"],
      },
    },
  },
  required: ["product_category", "visual_strategy", "images"],
  propertyOrdering: ["product_category", "visual_strategy", "images"],
};

/** Extra direction for the gift option, on top of the art director brief. */
const GIFT_SHOT_NOTE = `This listing is gift focused. For Image 2 (Lifestyle), show one friend giving the product to another friend as a gift, in a warm, genuine real-life moment that fits the Target Audience (for example a birthday, housewarming or holiday get-together). The product is being handed over or has just been unwrapped, clearly visible and recognisable, with the recipient visibly delighted. Both friends should look like people from the Target Audience.`;

export async function planImagePrompts(listing: SeoListing, photos: Photo[], isGift: boolean): Promise<string[]> {
  const note = isGift ? GIFT_SHOT_NOTE : null;
  const text = `Here is the output of the Ecommerce SEO Optimization Agent:

1. SEO Product Title: ${listing.title}
2. SEO Product Description:
${listing.description}
3. SEO Product Tags: ${listing.tags.join(", ")}
4. Primary Keyword: ${listing.primary_keyword}
5. Secondary Keywords: ${listing.secondary_keywords.join(", ")}
6. Target Audience: ${listing.target_audience}
7. Search Intent: ${listing.search_intent}
8. Product Positioning: ${listing.product_positioning}
9. Assumptions Made: ${listing.assumptions.length ? listing.assumptions.join("; ") : "None"}

The attached photo(s) are the seller's real product. Plan the 5 images in the required order.${note ? `\n\n${note}` : ""}`;

  const plan = await callGemini<{ images: { purpose: string; prompt: string }[] }>({
    system: `${IMAGE_DIRECTOR_PROMPT}\n\n${IMAGE_DIRECTOR_OUTPUT_CONTRACT}`,
    text,
    photos,
    schema: planSchema,
  });
  const prompts = plan.images.map((i) => i.prompt.trim()).filter(Boolean).slice(0, 5);
  if (prompts.length < 5) throw new Error(`Art director returned ${prompts.length} image prompts, expected 5.`);
  return prompts.slice(0, IMAGES_PER_OPTION);
}
