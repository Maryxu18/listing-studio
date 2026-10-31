"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const MAX_PHOTOS = 4;
const MAX_BYTES = 20 * 1024 * 1024;
// Photos are downscaled before upload: plenty for the AI models, and keeps the
// request well under Vercel's 4.5 MB body limit.
const MAX_SIDE = 1600;

async function downscale(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not process image."))), "image/jpeg", 0.88),
  );
}
// Etsy's top-level seller categories, so publishing can narrow to the right branch.
const CATEGORIES = [
  "Accessories",
  "Art & Collectibles",
  "Bags & Purses",
  "Bath & Beauty",
  "Books, Movies & Music",
  "Clothing",
  "Craft Supplies & Tools",
  "Electronics & Accessories",
  "Home & Living",
  "Jewelry",
  "Paper & Party Supplies",
  "Pet Supplies",
  "Shoes",
  "Toys & Games",
  "Weddings",
  "Other",
];

export function NewProductForm() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Release preview URLs on unmount; removals revoke their own.
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setError(null);
    const next = [...photos];
    for (const file of Array.from(list)) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        setError(`${file.name}: use JPEG, PNG or WebP.`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        setError(`${file.name} is larger than 20 MB.`);
        continue;
      }
      if (next.length >= MAX_PHOTOS) {
        setError(`Up to ${MAX_PHOTOS} photos.`);
        break;
      }
      next.push({ file, url: URL.createObjectURL(file) });
    }
    setPhotos(next);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (photos.length === 0) {
      setError("Add at least one product photo.");
      return;
    }
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    form.delete("photos");
    try {
      const blobs = await Promise.all(photos.map((p) => downscale(p.file)));
      blobs.forEach((blob, i) => form.append("photos", blob, `photo-${i + 1}.jpg`));
    } catch {
      setError("One of the photos could not be read. Try a different image.");
      setPending(false);
      return;
    }

    const res = await fetch("/api/generations", { method: "POST", body: form });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "Something went wrong.");
      setPending(false);
      return;
    }
    router.push(`/generations/${json.id}`);
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-6">
      <section className="card space-y-4 p-6">
        <h2 className="font-semibold">Product information</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Product name" required>
            <input name="name" className="input" required maxLength={120} placeholder="Hand-thrown ceramic mug" />
          </Field>
          <Field label="Category" required>
            <select name="category" className="input" required defaultValue="">
              <option value="" disabled>
                Choose a category
              </option>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Details" required hint="Size, colors, features, how it's made, care instructions…">
          <textarea
            name="details"
            className="input min-h-28"
            required
            maxLength={3000}
            placeholder="12 oz stoneware mug, speckled oatmeal glaze, dishwasher safe, each one slightly unique…"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Materials">
            <input name="materials" className="input" maxLength={300} placeholder="Stoneware clay, lead-free glaze" />
          </Field>
          <Field label="Price">
            <input name="price" className="input" maxLength={40} placeholder="$34" />
          </Field>
        </div>
        <Field label="Metadata & keywords" hint="Comma-separated: style, occasion, colors, anything buyers search for.">
          <input
            name="keywords"
            className="input"
            maxLength={500}
            placeholder="rustic, farmhouse, coffee lover gift, minimalist"
          />
        </Field>
      </section>

      <section className="card space-y-4 p-6">
        <div>
          <h2 className="font-semibold">
            Intended audience <span className="text-sm font-normal text-stone-500">(optional, but recommended)</span>
          </h2>
          <p className="text-sm text-stone-500">Who buys this? Better targeting means better titles and tags.</p>
        </div>
        <textarea
          name="audience"
          className="input min-h-20"
          maxLength={500}
          placeholder="Coffee and tea lovers aged 25-45 who like handmade, slow-living home goods; gift shoppers for housewarmings"
        />
      </section>

      <section className="card space-y-4 p-6">
        <div>
          <h2 className="font-semibold">
            Product photos <span className="text-brand-600">*</span>
          </h2>
          <p className="text-sm text-stone-500">
            At least one, up to {MAX_PHOTOS}. JPEG, PNG or WebP. A clear, well-lit shot works best.
          </p>
        </div>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            addFiles(e.dataTransfer.files);
          }}
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          {photos.map((p, i) => (
            <div key={p.url} className="group relative aspect-square overflow-hidden rounded-xl border border-stone-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" className="size-full object-cover" />
              <button
                type="button"
                onClick={() => {
                  URL.revokeObjectURL(p.url);
                  setPhotos(photos.filter((_, j) => j !== i));
                }}
                className="absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white opacity-0 transition group-hover:opacity-100"
              >
                Remove
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="grid aspect-square place-items-center rounded-xl border-2 border-dashed border-stone-300 text-sm text-stone-500 transition hover:border-brand-500 hover:text-brand-600"
            >
              <span className="text-center">
                <span className="block text-2xl">+</span>
                Add photo
                <span className="block text-xs">or drop here</span>
              </span>
            </button>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          name="photos"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </section>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="flex justify-end">
        <button className="btn-primary px-6 py-3 text-base" disabled={pending}>
          {pending ? "Uploading…" : "Generate 3 listing options"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">
        {label} {required && <span className="text-brand-600">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
    </label>
  );
}
