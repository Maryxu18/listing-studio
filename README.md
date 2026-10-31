# Listing Studio

Sellers describe a product and upload a photo. Listing Studio returns **3 recommendation sets**, each with an
SEO title, description, 10 tags (Gemini) and 5 product photos (Ideogram). The seller picks one, saves it to
**My products**, and publishes it to their real Etsy shop.

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind): UI and API routes in one app
- **Supabase Postgres + Storage**, provisioned with the Stripe Projects CLI (free tier)
  - Postgres: users, generations, generated images, confirmed products
  - Storage bucket `product-images`: seller photos (`uploads/…`) and generated images (`generated/…`)
- **Gemini** in two steps, both returning structured JSON:
  1. **SEO agent**: 3 options, each with a title, description, 10 tags, primary and secondary keywords, audience,
     search intent, positioning and assumptions.
  2. **Image art director**: `src/prompts/image-director.ts` (the brief, used verbatim) turns each option into
     5 Ideogram prompts: hero, lifestyle, features, angles and value.
  Uses lite models (`gemini-3.5-flash-lite`, falling back to `gemini-3.1-flash-lite` and `gemini-flash-lite-latest`)
  with low thinking. Each step takes about 3–5 s. The full Flash models took minutes and returned 503s on the free tier.
- **Ideogram 3.0 Remix** for images. The hero is remixed from the seller's photo and becomes the master
  product reference. Images 2–5 are remixed from the hero. Images are copied to Supabase Storage because Ideogram URLs expire.
- Username/password auth (bcrypt + signed JWT cookie)

## Setup

```bash
npm install
stripe projects env --pull          # writes Supabase creds + SESSION_SECRET to .env
stripe projects variables set gemini-api-key   --env-key GEMINI_API_KEY      # prompts for the value
stripe projects variables set ideogram-api-key --env-key IDEOGRAM_API_KEY
stripe projects variables set etsy-keystring     --env-key ETSY_KEYSTRING
stripe projects variables set etsy-shared-secret --env-key ETSY_SHARED_SECRET
npm run db:migrate                  # tables, storage bucket and policies (safe to re-run)
npm run dev                         # https://localhost:3000 (Etsy OAuth requires https)
```

In your Etsy app (etsy.com/developers/your-apps), register the callback URL
`https://localhost:3000/api/etsy/callback`. To get rid of the browser certificate warning, run
`~/Library/Caches/mkcert/mkcert-v1.4.4-darwin-arm64 -install` once (it asks for your password).

Optional env vars:

| Var | Default | Purpose |
| --- | --- | --- |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-flash-lite-latest` | Comma-separated fallback chain |
| `IMAGES_PER_OPTION` | `5` | Lower it (1-5) to save Ideogram credits while testing |
| `APP_URL` | `https://localhost:3000` | Base URL used to build the Etsy OAuth callback |
| `SUPABASE_SECRET_KEY` | (unset) | If set, used for storage uploads instead of the publishable key |

## Flow

1. `POST /api/generations` stores the photos and creates a `generations` row, then responds right away.
   Generation continues in `after()`.
2. The Gemini SEO agent writes the 3 options and saves them. The page shows the text immediately.
3. For each option in parallel, the art director plans 5 shots. The hero renders first, then images 2–5 render
   from the hero. Up to 4 Ideogram calls run at once, and the page polls and fills them in.
4. `POST /api/generations/:id/confirm` copies the chosen option into `products`.
5. **Etsy** (`src/lib/etsy.ts`, Open API v3):
   - `/api/etsy/connect` → Etsy OAuth 2.0 + PKCE (scopes `listings_r listings_w shops_r`) → `/api/etsy/callback`
     stores the tokens and shop. Tokens refresh automatically.
   - `POST /api/products/:id/publish` creates a **free draft**: `createDraftListing` with the shop's first shipping
     profile (and processing profile / return policy when present), plus an Etsy category picked by Gemini from
     Etsy's seller taxonomy. It then uploads the 5 images with the hero as the primary photo. The button links to the
     draft in Etsy's listing editor.
   - `POST /api/products/:id/activate` sets the listing to `active`. **Etsy charges its listing fee for this.** The button
     then links to the public `etsy.com/listing/…` page.

## Demo notes and limitations

- **Etsy:** the shop needs at least one shipping profile. Etsy tokens are stored in Postgres unencrypted, which is
  fine for a demo but should be encrypted in production.
- **Storage uses the publishable key.** Stripe Projects doesn't provide a Supabase service key, so
  `db/schema.sql` adds a policy that allows inserts into the `product-images` bucket. The bucket is publicly
  readable. That's fine for a demo. For production, set `SUPABASE_SECRET_KEY` and drop the anon insert policy.
- **The DB connection uses `SUPABASE_DB_PASS`** rather than the password embedded in `SUPABASE_POOLER_URL`,
  which is mis-encoded (see `src/lib/db-config.mjs`).
- Ideogram doesn't reproduce small printed logos or text on the product reliably across shots.
- Generation runs in-process. A generation interrupted by a server restart stays in "generating".
