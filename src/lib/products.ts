import { isUuid, sql } from "./db";
import { publicUrl } from "./storage";
import type { ProductInput } from "./types";

export type EtsyStatus = "not_published" | "draft" | "active";

export type Product = {
  id: string;
  generationId: string | null;
  input: ProductInput;
  title: string;
  description: string;
  tags: string[];
  imageUrls: string[];
  sourcePhotoUrls: string[];
  etsyStatus: EtsyStatus;
  etsyListingId: string | null;
  etsyUrl: string | null;
  publishedAt: Date | null;
  createdAt: Date;
};

type Row = {
  id: string;
  generation_id: string | null;
  input: ProductInput;
  title: string;
  description: string;
  tags: string[];
  image_paths: string[];
  source_photo_paths: string[];
  etsy_status: EtsyStatus;
  etsy_listing_id: string | null;
  etsy_url: string | null;
  published_at: Date | null;
  created_at: Date;
};

function toProduct(r: Row): Product {
  return {
    id: r.id,
    generationId: r.generation_id,
    input: r.input,
    title: r.title,
    description: r.description,
    tags: r.tags,
    imageUrls: r.image_paths.map(publicUrl),
    sourcePhotoUrls: r.source_photo_paths.map(publicUrl),
    etsyStatus: r.etsy_status,
    etsyListingId: r.etsy_listing_id,
    etsyUrl: r.etsy_url,
    publishedAt: r.published_at,
    createdAt: r.created_at,
  };
}

export async function listProducts(userId: string) {
  const rows = await sql<Row[]>`select * from products where user_id = ${userId} order by created_at desc`;
  return rows.map(toProduct);
}

export async function getProduct(id: string, userId: string) {
  if (!isUuid(id)) return null;
  const [row] = await sql<Row[]>`select * from products where id = ${id} and user_id = ${userId}`;
  return row ? toProduct(row) : null;
}
