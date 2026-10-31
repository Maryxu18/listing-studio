export type ProductInput = {
  name: string;
  category: string;
  details: string;
  materials?: string;
  price?: string;
  keywords?: string;
  audience?: string;
};

/** Output of the SEO step; also the input the image art director expects. */
export type SeoListing = {
  angle: string;
  title: string;
  description: string;
  tags: string[];
  primary_keyword: string;
  secondary_keywords: string[];
  target_audience: string;
  search_intent: string;
  product_positioning: string;
  assumptions: string[];
};

/** Stored per option in generations.options. image_prompts is filled once the art director has run. */
export type ListingOption = SeoListing & { image_prompts?: string[] };

export const OPTION_COUNT = 3;
/** One option is always gift focused; Gemini picks the strategy for the others. */
export const GIFT_OPTION_INDEX = 1;
export const GIFT_ANGLE = "Gift focused";
export const TAG_COUNT = 10;
export const IMAGES_PER_OPTION = Math.min(5, Math.max(1, Number(process.env.IMAGES_PER_OPTION) || 5));

/** The art director prompt's fixed shot order. */
export const IMAGE_ROLES = ["Hero", "Lifestyle", "Features", "Angles & details", "Value"] as const;
