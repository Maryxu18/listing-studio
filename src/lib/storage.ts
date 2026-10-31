import { createClient } from "@supabase/supabase-js";

export const BUCKET = "product-images";

// Uploads are allowed for this bucket by the storage policy in db/schema.sql.
// If a Supabase secret key is added later, prefer it.
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(process.env.SUPABASE_PROJECT_URL!, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export async function uploadImage(path: string, data: Buffer | Blob, contentType: string) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, data, { contentType, upsert: false });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return path;
}

export function publicUrl(path: string) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function downloadImage(path: string) {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(`Storage download failed for ${path}: ${error?.message}`);
  return { data: Buffer.from(await data.arrayBuffer()), mimeType: data.type || "image/png" };
}
