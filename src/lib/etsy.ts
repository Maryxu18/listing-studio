import { createHash, randomBytes } from "node:crypto";
import { sql } from "./db";
import { callGemini } from "./gemini";
import type { ProductInput } from "./types";

// Etsy Open API v3. Docs: https://developers.etsy.com/documentation
const API = "https://api.etsy.com/v3";
const SCOPES = ["listings_r", "listings_w", "shops_r"];

export const WHO_MADE = ["i_did", "someone_else", "collective"] as const;
export const WHEN_MADE = ["made_to_order", "2020_2026", "2010_2019", "2007_2009", "before_2007"] as const;

export class EtsyError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

function credentials() {
  const keystring = process.env.ETSY_KEYSTRING;
  const secret = process.env.ETSY_SHARED_SECRET;
  if (!keystring || !secret) throw new EtsyError("Etsy is not configured: set ETSY_KEYSTRING and ETSY_SHARED_SECRET.", 500);
  return { keystring, secret };
}

export function redirectUri() {
  return `${process.env.APP_URL || "https://localhost:3000"}/api/etsy/callback`;
}

// ---------------------------------------------------------------------------
// OAuth 2.0 with PKCE
// ---------------------------------------------------------------------------

export function startAuthorization() {
  const verifier = randomBytes(48).toString("base64url");
  const state = randomBytes(16).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const url = new URL("https://www.etsy.com/oauth/connect");
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: credentials().keystring,
    redirect_uri: redirectUri(),
    scope: SCOPES.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return { url: url.toString(), state, verifier };
}

type TokenResponse = { access_token: string; refresh_token: string; expires_in: number };

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${API}/public/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: credentials().keystring, ...params }),
  });
  if (!res.ok) throw new EtsyError(`Etsy sign-in failed (${res.status}): ${await errorText(res)}`);
  return res.json();
}

/** Exchanges the OAuth code, looks up the seller's shop and stores the connection. */
export async function completeAuthorization(userId: string, code: string, verifier: string) {
  const token = await tokenRequest({ grant_type: "authorization_code", redirect_uri: redirectUri(), code, code_verifier: verifier });
  // The access token is prefixed with the Etsy user id: "12345678.abc…"
  const etsyUserId = token.access_token.split(".")[0];

  const shopRes = await fetch(`${API}/application/users/${etsyUserId}/shops`, { headers: headers(token.access_token) });
  if (!shopRes.ok) throw new EtsyError(`Could not find an Etsy shop for this account (${shopRes.status}): ${await errorText(shopRes)}`);
  const shop = (await shopRes.json()) as { shop_id: number; shop_name: string };

  await sql`
    insert into etsy_connections (user_id, etsy_user_id, shop_id, shop_name, access_token, refresh_token, expires_at)
    values (${userId}, ${etsyUserId}, ${shop.shop_id}, ${shop.shop_name}, ${token.access_token}, ${token.refresh_token},
            now() + ${`${token.expires_in} seconds`}::interval)
    on conflict (user_id) do update set
      etsy_user_id = excluded.etsy_user_id, shop_id = excluded.shop_id, shop_name = excluded.shop_name,
      access_token = excluded.access_token, refresh_token = excluded.refresh_token,
      expires_at = excluded.expires_at, updated_at = now()`;
}

export type EtsyConnection = { shopId: string; shopName: string | null };

export async function getConnection(userId: string): Promise<EtsyConnection | null> {
  const [row] = await sql<{ shop_id: string; shop_name: string | null }[]>`
    select shop_id, shop_name from etsy_connections where user_id = ${userId}`;
  return row ? { shopId: row.shop_id, shopName: row.shop_name } : null;
}

export async function disconnect(userId: string) {
  await sql`delete from etsy_connections where user_id = ${userId}`;
}

/** Returns a valid access token, refreshing it when it is about to expire. */
async function accessToken(userId: string) {
  const [row] = await sql<{ access_token: string; refresh_token: string; expires_soon: boolean }[]>`
    select access_token, refresh_token, expires_at < now() + interval '2 minutes' as expires_soon
    from etsy_connections where user_id = ${userId}`;
  if (!row) throw new EtsyError("Connect your Etsy shop first.", 409);
  if (!row.expires_soon) return row.access_token;

  let token: TokenResponse;
  try {
    token = await tokenRequest({ grant_type: "refresh_token", refresh_token: row.refresh_token });
  } catch {
    await disconnect(userId);
    throw new EtsyError("Your Etsy connection expired. Please connect your shop again.", 409);
  }
  await sql`
    update etsy_connections set access_token = ${token.access_token}, refresh_token = ${token.refresh_token},
      expires_at = now() + ${`${token.expires_in} seconds`}::interval, updated_at = now()
    where user_id = ${userId}`;
  return token.access_token;
}

function headers(token?: string): Record<string, string> {
  const { keystring, secret } = credentials();
  return { "x-api-key": `${keystring}:${secret}`, ...(token && { authorization: `Bearer ${token}` }) };
}

async function errorText(res: Response) {
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    return String(json.error ?? json.error_description ?? text).slice(0, 300);
  } catch {
    return text.slice(0, 300);
  }
}

async function etsy<T>(userId: string, path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken(userId);
  const res = await fetch(`${API}/application${path}`, { ...init, headers: { ...headers(token), ...init.headers } });
  if (!res.ok) throw new EtsyError(`Etsy ${init.method ?? "GET"} ${path.split("?")[0]} failed (${res.status}): ${await errorText(res)}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Shop defaults and taxonomy
// ---------------------------------------------------------------------------

type ShopDefaults = { shippingProfileId: number; readinessStateId?: number; returnPolicyId?: number };

async function shopDefaults(userId: string, shopId: string): Promise<ShopDefaults> {
  const shipping = await etsy<{ results: { shipping_profile_id: number; is_deleted?: boolean }[] }>(
    userId,
    `/shops/${shopId}/shipping-profiles`,
  );
  const profile = shipping.results.find((p) => !p.is_deleted);
  if (!profile) {
    throw new EtsyError("Your Etsy shop has no shipping profile. Create one in Etsy Shop Manager › Settings › Shipping, then try again.", 409);
  }

  // Processing profiles and return policies are optional for drafts; use them when present.
  const readiness = await etsy<{ results: { readiness_state_id: number }[] }>(userId, `/shops/${shopId}/readiness-state-definitions`).catch(
    () => null,
  );
  const returns = await etsy<{ results: { return_policy_id: number }[] }>(userId, `/shops/${shopId}/policies/return`).catch(() => null);

  return {
    shippingProfileId: profile.shipping_profile_id,
    readinessStateId: readiness?.results[0]?.readiness_state_id,
    returnPolicyId: returns?.results[0]?.return_policy_id,
  };
}

type TaxonomyNode = { id: number; name: string; children: TaxonomyNode[] };
let taxonomyCache: TaxonomyNode[] | null = null;

/** Picks the most specific Etsy category for the product, using Gemini to choose among leaf categories. */
async function pickTaxonomyId(input: ProductInput, title: string): Promise<number> {
  if (!taxonomyCache) {
    const res = await fetch(`${API}/application/seller-taxonomy/nodes`, { headers: headers() });
    if (!res.ok) throw new EtsyError(`Could not load Etsy categories (${res.status}): ${await errorText(res)}`);
    taxonomyCache = ((await res.json()) as { results: TaxonomyNode[] }).results;
  }

  // Our form's category names mirror Etsy's top-level categories; narrow to that branch when it matches.
  const root = taxonomyCache.find((n) => n.name.toLowerCase() === input.category.toLowerCase());
  const leaves: { id: number; path: string }[] = [];
  const walk = (node: TaxonomyNode, path: string) => {
    const p = path ? `${path} > ${node.name}` : node.name;
    if (node.children.length === 0) leaves.push({ id: node.id, path: p });
    node.children.forEach((c) => walk(c, p));
  };
  (root ? [root] : taxonomyCache).forEach((n) => walk(n, ""));

  try {
    const { taxonomy_id } = await callGemini<{ taxonomy_id: number }>({
      text: `Pick the single best Etsy category for this product.
Product: ${title}
Seller's details: ${input.name}. ${input.details}

Categories (id: path):
${leaves.map((l) => `${l.id}: ${l.path}`).join("\n")}`,
      photos: [],
      schema: { type: "OBJECT", properties: { taxonomy_id: { type: "INTEGER" } }, required: ["taxonomy_id"] },
    });
    if (leaves.some((l) => l.id === taxonomy_id)) return taxonomy_id;
  } catch (err) {
    console.warn("Taxonomy pick failed, using a default:", err);
  }
  return root?.id ?? leaves[0].id;
}

// ---------------------------------------------------------------------------
// Listings
// ---------------------------------------------------------------------------

/** Etsy allows %, :, & and + only once each in a title. */
function cleanTitle(title: string) {
  const seen = new Set<string>();
  return title
    .replace(/[%:&+]/g, (ch) => (seen.has(ch) ? "" : (seen.add(ch), ch)))
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 140);
}

function cleanTags(tags: string[]) {
  return [...new Set(tags.map((t) => t.replace(/[^\p{L}\p{N}\s\-'™©®]/gu, "").trim().slice(0, 20)).filter(Boolean))].slice(0, 13);
}

export type DraftInput = {
  title: string;
  description: string;
  tags: string[];
  price: number;
  quantity: number;
  whoMade: (typeof WHO_MADE)[number];
  whenMade: (typeof WHEN_MADE)[number];
  materials?: string;
  input: ProductInput;
  images: { data: Buffer; mimeType: string }[];
};

/** Creates a draft listing (free) in the connected shop and uploads its images. */
export async function createDraft(userId: string, draft: DraftInput) {
  const connection = await getConnection(userId);
  if (!connection) throw new EtsyError("Connect your Etsy shop first.", 409);
  const { shopId } = connection;

  const [defaults, taxonomyId] = await Promise.all([shopDefaults(userId, shopId), pickTaxonomyId(draft.input, draft.title)]);

  const body = new URLSearchParams({
    quantity: String(draft.quantity),
    title: cleanTitle(draft.title),
    description: draft.description,
    price: draft.price.toFixed(2),
    who_made: draft.whoMade,
    when_made: draft.whenMade,
    taxonomy_id: String(taxonomyId),
    type: "physical",
    is_supply: "false",
    shipping_profile_id: String(defaults.shippingProfileId),
    tags: cleanTags(draft.tags).join(","),
  });
  if (defaults.readinessStateId) body.set("readiness_state_id", String(defaults.readinessStateId));
  if (defaults.returnPolicyId) body.set("return_policy_id", String(defaults.returnPolicyId));
  if (draft.materials) body.set("materials", draft.materials.split(",").map((m) => m.trim()).filter(Boolean).slice(0, 13).join(","));

  const listing = await etsy<{ listing_id: number }>(userId, `/shops/${shopId}/listings`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  // Rank 1 is the primary photo, so keep the hero first.
  for (const [i, image] of draft.images.entries()) {
    const form = new FormData();
    form.append("image", new Blob([new Uint8Array(image.data)], { type: image.mimeType }), `image-${i + 1}.${image.mimeType.split("/")[1]}`);
    form.append("rank", String(i + 1));
    await etsy(userId, `/shops/${shopId}/listings/${listing.listing_id}/images`, { method: "POST", body: form });
  }

  return {
    shopId,
    listingId: String(listing.listing_id),
    editUrl: `https://www.etsy.com/your/shops/me/listing-editor/edit/${listing.listing_id}`,
  };
}

/** Activates a draft. Etsy charges its listing fee for this. */
export async function activateListing(userId: string, shopId: string, listingId: string) {
  const listing = await etsy<{ url?: string; state: string }>(userId, `/shops/${shopId}/listings/${listingId}`, {
    method: "PATCH",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ state: "active" }),
  });
  return { url: listing.url || `https://www.etsy.com/listing/${listingId}`, state: listing.state };
}
